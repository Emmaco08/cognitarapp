"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

interface ControlSchool extends OfflineSchoolMeta {
  online_portal_enabled: boolean;
  online_teachers_enabled: boolean;
  online_students_enabled: boolean;
  online_portal_notice?: string;
  online_synced_at?: string | null;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [school, setSchool] = useState<ControlSchool | null>(null);
  const [adminUser, setAdminUser] = useState("Administrator");
  const [exams, setExams] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [examSearch, setExamSearch] = useState("");
  const [examStatus, setExamStatus] = useState("all");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [resetPick, setResetPick] = useState<Record<number, string>>({});
  const [busyServer, setBusyServer] = useState(false);
  const [syncingDb, setSyncingDb] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [meRes, ctrlRes, exRes, rosRes] = await Promise.all([
        fetch("/api/v1/portal/auth/me", { credentials: "include" }),
        fetch("/api/v1/portal/control", { credentials: "include" }),
        fetch("/api/v1/portal/exams", { credentials: "include" }),
        fetch("/api/v1/portal/roster", { credentials: "include" }),
      ]);
      if (exRes.status === 401 || exRes.status === 403 || ctrlRes.status === 401) {
        router.replace("/");
        return;
      }
      const me = meRes.ok ? await meRes.json() : null;
      const ctrl = ctrlRes.ok ? await ctrlRes.json() : null;
      const ex = exRes.ok ? await exRes.json() : null;
      const ros = rosRes.ok ? await rosRes.json() : null;

      if (me?.session?.username) setAdminUser(me.session.fullName || me.session.username);
      if (ctrl?.ok && ctrl.school) {
        setSchool({
          ...ctrl.school,
          school_logo_b64: ex?.school?.school_logo_b64 || "",
        });
      }
      if (ex?.ok) {
        setExams(ex.exams || []);
        setPendingCount(Number(ex.pending_students_count || 0));
        setLiveCount(Number(ex.live_sessions_count || 0));
      }
      if (ros?.ok) {
        setTeachers(ros.teachers || []);
        setStudents((ros.students || []).filter((s: any) => s.status === "approved"));
        const pCount = (ros.students || []).filter((s: any) => s.status === "pending").length;
        setPendingCount(pCount);
      }
    } catch {
      showCtToast("Could not load admin dashboard.", "bad");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const updateServerGate = async (patch: Record<string, boolean>) => {
    setBusyServer(true);
    try {
      const res = await fetch("/api/v1/portal/control", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json.ok && json.school) {
        setSchool((prev) => ({ ...(prev || {}), ...json.school }));
        showCtToast(json.message || "Online server updated.", "ok");
      } else {
        showCtToast(json.message || "Could not update server switch.", "bad");
      }
    } finally {
      setBusyServer(false);
    }
  };

  const syncFromCloudBackup = async () => {
    setSyncingDb(true);
    try {
      const res = await fetch("/api/v1/portal/sync", { method: "POST", credentials: "include" });
      const json = await res.json();
      if (res.ok && json.ok) {
        showCtToast("Synced latest desktop backup into Online Portal.", "ok");
        await loadAll();
      } else {
        showCtToast(json.message || "No cloud backup available yet.", "warn");
      }
    } finally {
      setSyncingDb(false);
    }
  };

  const toggleExamActive = async (ex: any) => {
    const res = await fetch("/api/v1/portal/exams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ local_id: ex.local_id, active: !ex.active }),
    });
    const json = await res.json();
    if (json.ok) {
      setExams((prev) => prev.map((e) => (e.local_id === ex.local_id ? { ...e, active: !e.active } : e)));
      showCtToast(!ex.active ? `Activated "${ex.name}"` : `Paused "${ex.name}"`, "ok");
    }
  };

  const deleteExam = async (ex: any) => {
    if (!window.confirm(`Delete examination "${ex.name}" and all its questions?`)) return;
    const res = await fetch(`/api/v1/portal/exams?local_id=${ex.local_id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (json.ok) {
      setExams((prev) => prev.filter((e) => e.local_id !== ex.local_id));
      showCtToast(`Deleted "${ex.name}".`, "ok");
    }
  };

  const deleteTeacher = async (t: any) => {
    if (!window.confirm(`Delete teacher "${t.full_name || t.username}"?`)) return;
    const res = await fetch(`/api/v1/portal/roster?kind=teacher&local_id=${t.local_id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (json.ok) {
      setTeachers((prev) => prev.filter((x) => x.local_id !== t.local_id));
      showCtToast("Teacher removed.", "ok");
    }
  };

  const deleteStudent = async (s: any) => {
    if (!window.confirm(`Delete student "${s.full_name || s.username}"?`)) return;
    const res = await fetch(`/api/v1/portal/roster?kind=student&local_id=${s.local_id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (json.ok) {
      setStudents((prev) => prev.filter((x) => x.local_id !== s.local_id));
      showCtToast("Student removed.", "ok");
    }
  };

  const resetStudentAttempt = async (st: any) => {
    const examLocalId = Number(resetPick[st.local_id] || 0);
    if (!examLocalId) {
      showCtToast("Choose an examination attempt to reset.", "warn");
      return;
    }
    if (!window.confirm(`Reset this exam attempt for ${st.full_name}? The student will be allowed to retake it.`)) return;
    const res = await fetch("/api/v1/portal/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "reset_attempt",
        student_local_id: st.local_id,
        exam_local_id: examLocalId,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast("Student exam attempt reset.", "ok");
      await loadAll();
    } else {
      showCtToast(json.message || "Could not reset attempt.", "bad");
    }
  };

  const activeExamCount = useMemo(() => exams.filter((e) => e.active && !e.deactivated).length, [exams]);

  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return exams.filter((e) => {
      const st = e.deactivated ? "deactivated" : e.active ? "active" : "inactive";
      if (examStatus !== "all" && st !== examStatus) return false;
      if (!q) return true;
      return `${e.name} ${e.exam_class} ${e.subject_tag || ""} ${e.teacher_name || ""}`.toLowerCase().includes(q);
    });
  }, [exams, examSearch, examStatus]);

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) =>
      `${t.full_name} ${t.username} ${t.primary_class || ""} ${(t.classes_json || []).join(" ")}`
        .toLowerCase()
        .includes(q)
    );
  }, [teachers, teacherSearch]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      `${s.full_name} ${s.username} ${s.student_class || ""} ${s.specialisation || ""}`.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const serverOnline = Boolean(school?.online_portal_enabled);
  const teachersAllowed = Boolean(school?.online_teachers_enabled);
  const studentsAllowed = Boolean(school?.online_students_enabled);

  return (
    <div className="ct-app ad-studio">
      <AdminShell
        active="overview"
        crumb="Dashboard"
        school={school}
        username={adminUser}
        counts={{ exams_count: exams.length, pending_count: pendingCount, live_count: liveCount }}
      >
        {/* EXACT OFFLINE ADMIN OVERVIEW HEADER */}
        <header className="tc-head ct-animate-rise" id="sec-overview">
          <div className="tc-head__txt">
            <h1>{school?.portal_school_name || school?.school_name || "School Administration"}</h1>
            <div className="tc-head__tags">
              <span className="tc-pill">Signed in as {adminUser}</span>
              <span className="tc-pill">
                <CtIco name="i-calendar" className="ct-ico--xs" />
                {school?.current_term || "First Term"} · {school?.academic_session || "2026/2027"}
              </span>
              <span className={`tc-pill ${serverOnline ? "tc-pill--ok" : "tc-pill--warn"}`}>
                <i className="tc-dot" />
                {serverOnline ? "Online Server Live" : "Online Server Off"}
              </span>
            </div>
          </div>
          <div className="tc-head__actions">
            <Link className="tc-btn tc-btn--secondary" href="/admin/support">
              <CtIco name="i-activity" className="ct-ico--sm" />
              Live Support
            </Link>
            <Link className="tc-btn tc-btn--secondary" href="/admin/add-teacher">
              <CtIco name="i-teacher" className="ct-ico--sm" />
              Add Teacher
            </Link>
            <Link className="tc-btn tc-btn--primary" href="/admin/add-student">
              <CtIco name="i-users" className="ct-ico--sm" />
              Add Student
            </Link>
          </div>
        </header>

        {/* ONLINE SERVER TURN ON / OFF CONTROL PANEL (The one key online-only addition right on Admin Dashboard!) */}
        <section className="ad-srv-panel" aria-label="Online Exam Server Controls">
          <div className="ad-srv-top">
            <div className="ad-srv-status">
              <span className={`ad-srv-lamp${serverOnline ? " is-live" : ""}`}>
                <CtIco name="i-server" className="ct-ico--sm" />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="ad-srv-title">
                  <h2>Online Exam Server</h2>
                  <span className={`ad-srv-state-tag${serverOnline ? " is-live" : ""}`}>
                    {serverOnline ? "SERVER LIVE" : "SERVER OFF"}
                  </span>
                </div>
                <p className="ad-srv-sub">
                  {serverOnline
                    ? "Your school portal is live. Control whether teachers and students can sign in below."
                    : "Server is switched off. Only administrators can sign in until you turn it back on."}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {school?.school_code && (
                <button
                  type="button"
                  className="ad-srv-code-box"
                  title="Copy School ID"
                  onClick={() => {
                    void navigator.clipboard?.writeText(school.school_code || "");
                    showCtToast(`Copied School ID: ${school.school_code}`, "ok");
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <span>ID: {school.school_code}</span>
                  <CtIco name="i-copy" className="ct-ico--xs" />
                </button>
              )}
              <button
                type="button"
                className="tc-btn tc-btn--secondary tc-btn--sm"
                disabled={syncingDb}
                onClick={() => void syncFromCloudBackup()}
              >
                <CtIco name="i-refresh" className="ct-ico--xs" />
                {syncingDb ? "Syncing..." : "Sync Backup"}
              </button>
              <button
                type="button"
                className={`tc-btn tc-btn--sm ${serverOnline ? "tc-btn--danger-soft" : "tc-btn--primary"}`}
                disabled={busyServer}
                onClick={() => void updateServerGate({ online_portal_enabled: !serverOnline })}
              >
                <CtIco name={serverOnline ? "i-stop" : "i-play"} className="ct-ico--xs" />
                {serverOnline ? "Turn Off Server" : "Turn On Server"}
              </button>
            </div>
          </div>

          <div className="ad-srv-controls">
            <div className="ad-srv-toggle-card">
              <div>
                <strong>Master Server Power</strong>
                <span>{serverOnline ? "Portal accepting logins" : "Portal paused for staff & students"}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={serverOnline}
                aria-label="Toggle Online Exam Server"
                disabled={busyServer}
                className={`ad-srv-switch${serverOnline ? " is-on" : ""}`}
                onClick={() => void updateServerGate({ online_portal_enabled: !serverOnline })}
              />
            </div>

            <div className="ad-srv-toggle-card">
              <div>
                <strong>Teacher Access</strong>
                <span>{teachersAllowed && serverOnline ? "Teachers can author exams from home" : "Teacher sign-in disabled"}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={teachersAllowed}
                aria-label="Toggle Teacher Access"
                disabled={busyServer || !serverOnline}
                className={`ad-srv-switch${teachersAllowed && serverOnline ? " is-on" : ""}`}
                onClick={() => void updateServerGate({ online_teachers_enabled: !teachersAllowed })}
              />
            </div>

            <div className="ad-srv-toggle-card">
              <div>
                <strong>Student Access</strong>
                <span>{studentsAllowed && serverOnline ? "Students can take exams online" : "Student sign-in disabled"}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={studentsAllowed}
                aria-label="Toggle Student Access"
                disabled={busyServer || !serverOnline}
                className={`ad-srv-switch${studentsAllowed && serverOnline ? " is-on" : ""}`}
                onClick={() => void updateServerGate({ online_students_enabled: !studentsAllowed })}
              />
            </div>
          </div>
        </section>

        {/* EXACT OFFLINE 4-COLUMN KPI STRIP */}
        <section className="tc-kpi-strip" aria-label="School overview numbers">
          <div className="tc-kpi">
            <span className="tc-kpi__label">Total Exams</span>
            <strong className="tc-kpi__val">{exams.length}</strong>
            <span className="tc-kpi__meta">
              <span className="tc-pill tc-pill--ok">
                <i className="tc-dot" />
                {activeExamCount} active
              </span>
              <a href="#sec-exams" style={{ marginLeft: "auto" }}>
                Directory <CtIco name="i-arrow-right" className="ct-ico--xs" />
              </a>
            </span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Approved Students</span>
            <strong className="tc-kpi__val">{students.length}</strong>
            <span className="tc-kpi__meta">
              Enrolled this session
              <a href="#sec-students" style={{ marginLeft: "auto" }}>
                Roster <CtIco name="i-arrow-right" className="ct-ico--xs" />
              </a>
            </span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Teachers</span>
            <strong className="tc-kpi__val">{teachers.length}</strong>
            <span className="tc-kpi__meta">
              Faculty accounts
              <a href="#sec-teachers" style={{ marginLeft: "auto" }}>
                Manage <CtIco name="i-arrow-right" className="ct-ico--xs" />
              </a>
            </span>
          </div>
          <div className="tc-kpi">
            <span className="tc-kpi__label">Pending Approvals</span>
            <strong className="tc-kpi__val">{pendingCount}</strong>
            <span className="tc-kpi__meta">
              {pendingCount > 0 ? <span className="tc-pill tc-pill--warn">Action needed</span> : "All caught up"}
              <Link href="/admin/pending-students" style={{ marginLeft: "auto" }}>
                Review <CtIco name="i-arrow-right" className="ct-ico--xs" />
              </Link>
            </span>
          </div>
        </section>

        {/* ================= EXAMS DIRECTORY (#sec-exams) ================= */}
        <section className="tc-card" id="sec-exams">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>Examinations Directory</h2>
              <p>Preview papers, toggle student availability, create exams, or manage in Control Center</p>
            </div>
            <div className="tc-card__tools">
              <label className="tc-search">
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  placeholder="Filter exams, class, teacher..."
                />
              </label>
              <select
                className="ad-filter-select"
                value={examStatus}
                onChange={(e) => setExamStatus(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="deactivated">Deactivated</option>
              </select>
              <Link className="tc-btn tc-btn--secondary tc-btn--sm" href="/admin/add-exam">
                <CtIco name="i-plus" className="ct-ico--xs" />
                Add Exam
              </Link>
              <Link className="tc-btn tc-btn--secondary tc-btn--sm" href="/admin/exams-management">
                <CtIco name="i-live" className="ct-ico--xs" />
                Control Center
              </Link>
            </div>
          </div>

          <div className="tc-table-wrap ct-table-wrap">
            {loading ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading directory...</div>
            ) : filteredExams.length === 0 ? (
              <div className="tc-empty">
                <span className="tc-empty__ico"><CtIco name="i-doc" /></span>
                <strong>No examinations found</strong>
                <p>Sync a desktop backup or create a new examination to populate your directory.</p>
              </div>
            ) : (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Examination</th>
                    <th style={{ width: 110 }}>Class</th>
                    <th style={{ minWidth: 160 }}>Subject &amp; Track</th>
                    <th className="is-center" style={{ width: 95 }}>Duration</th>
                    <th className="is-center" style={{ width: 120 }}>Status</th>
                    <th style={{ width: 240, textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map((ex) => (
                    <tr key={ex.local_id}>
                      <td>
                        <strong style={{ display: "block", fontWeight: 650 }}>{ex.name}</strong>
                        <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                          #{ex.local_id} · {ex.question_count || 0} Qs
                          {ex.teacher_name ? ` · ${ex.teacher_name}` : ""}
                        </span>
                      </td>
                      <td><span className="tc-pill">{ex.exam_class}</span></td>
                      <td>
                        <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                          <span className="tc-pill">{ex.subject_tag || "General"}</span>
                          {ex.specialisation && <span className="tc-pill tc-pill--accent">{ex.specialisation}</span>}
                        </div>
                      </td>
                      <td className="tc-mono is-center">{ex.duration}m</td>
                      <td className="is-center">
                        {ex.deactivated ? (
                          <span className="tc-pill tc-pill--bad">Deactivated</span>
                        ) : ex.active ? (
                          <span className="tc-pill tc-pill--ok"><i className="tc-dot" />Active</span>
                        ) : (
                          <span className="tc-pill"><i className="tc-dot" />Inactive</span>
                        )}
                      </td>
                      <td>
                        <div className="tc-actions">
                          <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/admin/exam/${ex.local_id}/preview`}>
                            <CtIco name="i-eye" className="ct-ico--xs" />
                            Preview
                          </Link>
                          {!ex.deactivated && (
                            <button
                              type="button"
                              className={`tc-btn tc-btn--sm ${ex.active ? "tc-btn--danger-soft" : "tc-btn--ok"}`}
                              onClick={() => void toggleExamActive(ex)}
                            >
                              {ex.active ? "Stop" : "Start"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="tc-btn tc-btn--ghost tc-btn--icon"
                            style={{ color: "var(--tc-bad)" }}
                            onClick={() => void deleteExam(ex)}
                            title="Delete exam"
                          >
                            <CtIco name="i-trash" className="ct-ico--sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ================= TEACHERS DIRECTORY (#sec-teachers) ================= */}
        <section className="tc-card" id="sec-teachers">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>Teachers Directory</h2>
              <p>Manage faculty login accounts, teaching class assignments, and Form Teacher roles</p>
            </div>
            <div className="tc-card__tools">
              <label className="tc-search">
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  placeholder="Search teacher or class..."
                />
              </label>
              <Link className="tc-btn tc-btn--primary tc-btn--sm" href="/admin/add-teacher">
                <CtIco name="i-plus" className="ct-ico--xs" />
                Add Teacher
              </Link>
            </div>
          </div>

          <div className="tc-table-wrap ct-table-wrap">
            {filteredTeachers.length === 0 ? (
              <div className="tc-empty">
                <span className="tc-empty__ico"><CtIco name="i-teacher" /></span>
                <strong>No teachers registered yet</strong>
                <p>Use Add Teacher to create a faculty account with class assignments.</p>
              </div>
            ) : (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Assigned Classes</th>
                    <th>Form Teacher</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeachers.map((t) => {
                    const clsList: string[] = Array.isArray(t.classes_json) && t.classes_json.length
                      ? t.classes_json
                      : t.primary_class
                        ? [t.primary_class]
                        : [];
                    return (
                      <tr key={t.local_id}>
                        <td>
                          <strong style={{ display: "block", fontWeight: 640 }}>{t.full_name || t.username}</strong>
                          <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                            @{t.username}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {clsList.length ? clsList.map((c) => <span key={c} className="tc-pill">{c}</span>) : <span style={{ color: "var(--tc-ink-3)", fontSize: 12 }}>All classes</span>}
                          </div>
                        </td>
                        <td>
                          {t.class_teacher_of ? (
                            <span className="tc-pill tc-pill--warn">{t.class_teacher_of}</span>
                          ) : (
                            <span style={{ color: "var(--tc-ink-3)", fontSize: 12.5 }}>-</span>
                          )}
                        </td>
                        <td>
                          <div className="tc-actions">
                            <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/admin/edit-teacher/${t.local_id}`}>
                              <CtIco name="i-edit" className="ct-ico--xs" />
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="tc-btn tc-btn--ghost tc-btn--icon"
                              style={{ color: "var(--tc-bad)" }}
                              onClick={() => void deleteTeacher(t)}
                              title="Delete teacher"
                            >
                              <CtIco name="i-trash" className="ct-ico--sm" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* ================= STUDENTS DIRECTORY (#sec-students) ================= */}
        <section className="tc-card" id="sec-students">
          <div className="tc-card__head">
            <div className="tc-card__title">
              <h2>Students Directory</h2>
              <p>Inspect approved student profiles, reset individual exam attempts, or edit accounts</p>
            </div>
            <div className="tc-card__tools">
              <label className="tc-search">
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student, class, username..."
                />
              </label>
              <Link className="tc-btn tc-btn--primary tc-btn--sm" href="/admin/add-student">
                <CtIco name="i-plus" className="ct-ico--xs" />
                Add Student
              </Link>
            </div>
          </div>

          <div className="tc-table-wrap ct-table-wrap">
            {filteredStudents.length === 0 ? (
              <div className="tc-empty">
                <span className="tc-empty__ico"><CtIco name="i-users" /></span>
                <strong>No approved students found</strong>
                <p>Add a student or approve pending self-registrations.</p>
              </div>
            ) : (
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class &amp; Track</th>
                    <th>Recent Performance</th>
                    <th>Reset Attempt</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => {
                    const atts: any[] = Array.isArray(s.attempts) ? s.attempts : [];
                    return (
                      <tr key={s.local_id}>
                        <td>
                          <Link href={`/admin/student/${s.local_id}`} style={{ fontWeight: 650, color: "var(--tc-ink)", display: "block" }}>
                            {s.full_name || s.username}
                          </Link>
                          <span className="tc-mono" style={{ fontSize: 11.5, color: "var(--tc-ink-3)" }}>
                            @{s.username}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                            <span className="tc-pill">{s.student_class || "General"}</span>
                            {s.specialisation && s.specialisation !== "General" && (
                              <span className="tc-pill tc-pill--accent">{s.specialisation}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          {atts.length > 0 ? (
                            <div className="ad-stu-chips">
                              {atts.slice(0, 2).map((a) => (
                                <span key={a.exam_local_id} className="ad-stu-chip" title={a.exam_name}>
                                  {a.exam_name}: <b>{Math.round(Number(a.percentage || 0))}%</b>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--tc-ink-3)" }}>No exams yet</span>
                          )}
                        </td>
                        <td>
                          {atts.length > 0 ? (
                            <div className="ad-reset-wrap">
                              <select
                                className="ad-reset-select"
                                value={resetPick[s.local_id] || ""}
                                onChange={(e) => setResetPick((p) => ({ ...p, [s.local_id]: e.target.value }))}
                              >
                                <option value="">Select exam...</option>
                                {atts.map((a) => (
                                  <option key={a.exam_local_id} value={String(a.exam_local_id)}>
                                    {a.exam_name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="tc-btn tc-btn--secondary tc-btn--sm"
                                onClick={() => void resetStudentAttempt(s)}
                              >
                                Reset
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--tc-ink-3)" }}>-</span>
                          )}
                        </td>
                        <td>
                          <div className="tc-actions">
                            <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/admin/student/${s.local_id}`}>
                              Profile
                            </Link>
                            <Link className="tc-btn tc-btn--secondary tc-btn--sm" href={`/admin/edit-student/${s.local_id}`}>
                              Edit
                            </Link>
                            <button
                              type="button"
                              className="tc-btn tc-btn--ghost tc-btn--icon"
                              style={{ color: "var(--tc-bad)" }}
                              onClick={() => void deleteStudent(s)}
                              title="Delete student"
                            >
                              <CtIco name="i-trash" className="ct-ico--sm" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </AdminShell>
    </div>
  );
}
