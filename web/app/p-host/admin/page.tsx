"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { PortalPowerDial } from "@/components/portal/PortalPowerDial";
import { QuestionAuthorModal } from "@/components/portal/QuestionAuthorModal";
import {
  AdminCloudViews,
  CloudAccountPayload,
  CloudBackupPayload,
  CloudPaymentRecord,
  CloudReferralPayload,
} from "@/components/portal/AdminCloudViews";
import {
  PIconArrowRight,
  PIconChart,
  PIconCheck,
  PIconClock,
  PIconCloud,
  PIconCopy,
  PIconDoc,
  PIconDownload,
  PIconGift,
  PIconHome,
  PIconKey,
  PIconLive,
  PIconPause,
  PIconPlay,
  PIconPlus,
  PIconPower,
  PIconSearch,
  PIconTrash,
  PIconUser,
  PIconUsers,
} from "@/components/portal/PortalIcons";

interface AdminExamRow {
  local_id: number;
  name: string;
  exam_class: string;
  teacher_name: string | null;
  subject_tag?: string;
  specialisation?: string;
  duration: number;
  active: boolean;
  is_paused_all: boolean;
  calculator_type: string;
  results_released: boolean;
  question_count: number;
  submission_count: number;
  live_count: number;
}

interface AdminResultRow {
  id: string;
  exam_local_id: number;
  exam_name: string;
  student_name: string;
  student_username: string;
  student_class: string;
  score: number;
  total: number;
  percentage: number;
  grade_label: string;
  submitted: boolean;
  results_released: boolean;
  origin: string;
  synced_to_desktop: boolean;
}

interface RosterStudent {
  local_id: number;
  username: string;
  full_name: string;
  student_class: string;
  specialisation: string;
  status: string;
}

interface RosterTeacher {
  local_id: number;
  username: string;
  full_name: string;
  primary_class: string;
  classes_json: string[];
}

type AdminNavId =
  | "overview"
  | "exams"
  | "results"
  | "teachers"
  | "students"
  | "approvals"
  | "portal"
  | "licence"
  | "backups"
  | "referrals";

function downloadResultsCsv(rows: AdminResultRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Student", "Username", "Class", "Exam", "Score", "Total", "Percent", "Grade", "Origin", "SyncedToDesktop"]
      .map(esc)
      .join(","),
    ...rows.map((r) =>
      [
        r.student_name,
        r.student_username,
        r.student_class,
        r.exam_name,
        r.score,
        r.total,
        r.percentage,
        r.grade_label,
        r.origin,
        r.synced_to_desktop ? "Yes" : "Pending",
      ]
        .map(esc)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cognitara-school-results.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminPortalConsolePage() {
  const router = useRouter();
  const [nav, setNav] = useState<AdminNavId>("overview");
  const [authOk, setAuthOk] = useState(false);
  const [adminLabel, setAdminLabel] = useState("Administrator");
  const [schoolCode, setSchoolCode] = useState("");
  const [schoolName, setSchoolName] = useState("CogniTara School");
  const [termMeta, setTermMeta] = useState("First Term · 2026/2027");
  const [portalLive, setPortalLive] = useState(false);

  const [classes, setClasses] = useState<string[]>([]);
  const [exams, setExams] = useState<AdminExamRow[]>([]);
  const [results, setResults] = useState<AdminResultRow[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [teachers, setTeachers] = useState<RosterTeacher[]>([]);

  // Unified Cloud Account data (replaces old cognitara.net/dashboard)
  const [cloudAccount, setCloudAccount] = useState<CloudAccountPayload | null>(null);
  const [cloudPayments, setCloudPayments] = useState<CloudPaymentRecord[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackupPayload | null>(null);
  const [cloudReferrals, setCloudReferrals] = useState<CloudReferralPayload | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(true);

  const [examSearch, setExamSearch] = useState("");
  const [examStatusFilter, setExamStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Modals
  const [authorExam, setAuthorExam] = useState<{ id: number; name: string } | null>(null);
  const [showAddExam, setShowAddExam] = useState(false);
  const [exName, setExName] = useState("");
  const [exClass, setExClass] = useState("");
  const [exDur, setExDur] = useState(40);
  const [exCalc, setExCalc] = useState<"none" | "basic" | "scientific">("none");
  const [exActive, setExActive] = useState(true);

  const [showAddPerson, setShowAddPerson] = useState<"student" | "teacher" | null>(null);
  const [pName, setPName] = useState("");
  const [pUser, setPUser] = useState("");
  const [pPass, setPPass] = useState("");
  const [pClass, setPClass] = useState("");

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? "" : cur)), 3400);
  }

  async function loadAll() {
    try {
      const meRes = await fetch("/api/v1/portal/auth/me", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => null);
      if (!meRes?.authenticated || meRes.session?.role !== "admin") {
        router.replace("/");
        return;
      }
      setAuthOk(true);
      setAdminLabel(String(meRes.session.fullName || meRes.session.username));
      setSchoolCode(String(meRes.session.schoolCode || meRes.school?.school_code || ""));
      if (meRes.school?.school_name) setSchoolName(String(meRes.school.school_name));
      setPortalLive(Boolean(meRes.school?.online_portal_enabled));

      const [exRes, resRes, rosRes, accRes, payRes, bakRes, refRes] = await Promise.all([
        fetch("/api/v1/portal/exams", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/portal/results", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/portal/roster", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/payments/history", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/backups", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/referrals/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (exRes?.ok) {
        setExams(Array.isArray(exRes.exams) ? exRes.exams : []);
        const cls: string[] = Array.isArray(exRes.classes) ? exRes.classes : [];
        setClasses(cls);
        if (!exClass && cls.length) setExClass(cls[0]);
        if (!pClass && cls.length) setPClass(cls[0]);
        if (exRes.school?.portal_school_name) setSchoolName(String(exRes.school.portal_school_name));
        if (exRes.school?.current_term || exRes.school?.academic_session) {
          setTermMeta(
            `${exRes.school.current_term || "First Term"} · ${exRes.school.academic_session || "2026/2027"}`
          );
        }
        if (typeof exRes.school?.online_portal_enabled === "boolean") {
          setPortalLive(exRes.school.online_portal_enabled);
        }
      }
      if (resRes?.ok && Array.isArray(resRes.results)) setResults(resRes.results);
      if (rosRes?.ok) {
        setStudents(Array.isArray(rosRes.students) ? rosRes.students : []);
        setTeachers(Array.isArray(rosRes.teachers) ? rosRes.teachers : []);
      }
      if (accRes?.ok) setCloudAccount(accRes);
      if (payRes?.ok && Array.isArray(payRes.payments)) setCloudPayments(payRes.payments);
      if (bakRes?.ok) setCloudBackups(bakRes);
      if (refRes?.ok) setCloudReferrals(refRes);
    } finally {
      setLoading(false);
      setLoadingCloud(false);
    }
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (
      q &&
      ["overview", "exams", "results", "teachers", "students", "approvals", "portal", "licence", "backups", "referrals"].includes(q)
    ) {
      setNav(q as AdminNavId);
    }
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignOut() {
    await fetch("/api/v1/portal/auth/logout", { method: "POST", credentials: "include" });
    router.replace(schoolCode ? `/?school=${encodeURIComponent(schoolCode)}` : "/");
  }

  async function patchExam(localId: number, patch: Record<string, unknown>, label: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_id: localId, ...patch }),
      });
      if (res.ok) {
        notify(label);
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteExam(localId: number) {
    if (!window.confirm("Delete this exam and all its questions?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/portal/exams?local_id=${localId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        notify("Exam deleted");
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: exName,
          exam_class: exClass || "All",
          duration: Number(exDur),
          calculator_type: exCalc,
          active: exActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setShowAddExam(false);
        setExName("");
        notify("Exam created");
        await loadAll();
        if (data.exam?.local_id) {
          setAuthorExam({ id: Number(data.exam.local_id), name: String(data.exam.name) });
        }
      } else {
        notify(data.message || "Could not create exam");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResultAction(
    attemptId: string,
    action: "force_submit" | "toggle_release",
    extra: Record<string, unknown> = {}
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/results", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_id: attemptId, action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        notify(data.message || "Updated");
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function updateStudentStatus(localId: number, status: "approved" | "suspended") {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ local_id: localId, status }),
      });
      if (res.ok) {
        notify(`Student ${status}`);
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleAddPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!showAddPerson) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          showAddPerson === "teacher"
            ? { kind: "teacher", full_name: pName, username: pUser, password: pPass, classes: pClass }
            : { kind: "student", full_name: pName, username: pUser, password: pPass, student_class: pClass }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setShowAddPerson(null);
        setPName("");
        setPUser("");
        setPPass("");
        notify(data.message || "Account added");
        await loadAll();
      } else {
        notify(data.message || "Could not add account");
      }
    } finally {
      setBusy(false);
    }
  }

  const approvedStudents = useMemo(
    () => students.filter((s) => s.status === "approved"),
    [students]
  );
  const pendingStudents = useMemo(
    () => students.filter((s) => s.status !== "approved"),
    [students]
  );
  const activeExamsCount = useMemo(() => exams.filter((e) => e.active).length, [exams]);

  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return exams.filter((ex) => {
      if (examStatusFilter === "active" && !ex.active) return false;
      if (examStatusFilter === "inactive" && ex.active) return false;
      if (q) {
        const hay = `${ex.name} ${ex.exam_class || ""} ${ex.teacher_name || ""} ${ex.subject_tag || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [exams, examSearch, examStatusFilter]);

  if (loading || !authOk) {
    return (
      <div className="pt-modal-backdrop" style={{ background: "var(--pt-canvas)" }}>
        <div className="pt-modal">
          <h2>Loading Admin Portal...</h2>
        </div>
      </div>
    );
  }

  const crumbMap: Record<AdminNavId, string> = {
    overview: "Dashboard",
    exams: "Examinations",
    results: "Results",
    teachers: "Teachers",
    students: "Students",
    approvals: "Pending Approvals",
    portal: "Online Portal Control",
    licence: "Licence & Billing",
    backups: "Cloud Backups",
    referrals: "Referrals & Rewards",
  };

  function copySchoolId() {
    if (!schoolCode) return;
    navigator.clipboard?.writeText(schoolCode).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  }

  function renderExamsTable() {
    return (
      <section className="pt-card" aria-label="Examinations directory">
        <div className="pt-card__head">
          <div className="pt-card__title">
            <h2>Examinations Directory</h2>
            <p>Manage paper availability, edit questions, pause active sessions, or release scores</p>
          </div>
          <div className="pt-card__tools">
            <label className="pt-search">
              <PIconSearch size={14} />
              <input
                type="search"
                placeholder="Filter exams, class, teacher"
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
                aria-label="Filter exams"
              />
            </label>
            <select
              className="pt-select-sm"
              value={examStatusFilter}
              onChange={(e) => setExamStatusFilter(e.target.value as "all" | "active" | "inactive")}
              aria-label="Filter exam status"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button type="button" className="pt-btn pt-btn--primary pt-btn--sm" onClick={() => setShowAddExam(true)}>
              <PIconPlus size={13} />
              <span>Create Exam</span>
            </button>
          </div>
        </div>

        {filteredExams.length === 0 ? (
          <div className="pt-empty">
            <span className="pt-empty__ico">
              <PIconDoc size={18} />
            </span>
            <strong>No examinations found</strong>
            <p>Sync a cloud backup from CogniTara Studio Desktop or create an online examination directly.</p>
          </div>
        ) : (
          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Examination</th>
                  <th>Class</th>
                  <th>Duration</th>
                  <th>Questions</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExams.map((ex) => (
                  <tr key={ex.local_id}>
                    <td>
                      <strong style={{ display: "block", fontWeight: 600 }}>{ex.name}</strong>
                      <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                        #{ex.local_id}
                        {ex.teacher_name ? ` · ${ex.teacher_name}` : ""}
                      </span>
                    </td>
                    <td>{ex.exam_class || "All"}</td>
                    <td className="pt-mono" style={{ color: "var(--pt-ink-2)" }}>{ex.duration} min</td>
                    <td className="pt-mono">{ex.question_count}</td>
                    <td className="pt-mono">
                      {ex.submission_count}
                      {ex.live_count > 0 ? (
                        <span style={{ marginLeft: 6, color: "var(--pt-ink-3)", fontSize: 11.5 }}>
                          ({ex.live_count} live)
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`pt-status ${ex.active && !ex.is_paused_all ? "is-live" : ""}`}>
                        <span className="pt-dot" />
                        {ex.is_paused_all ? "Paused" : ex.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="pt-row-actions">
                        <button
                          type="button"
                          className="pt-btn pt-btn--sm"
                          onClick={() => setAuthorExam({ id: ex.local_id, name: ex.name })}
                        >
                          Questions
                        </button>
                        <button
                          type="button"
                          className="pt-btn pt-btn--sm"
                          disabled={busy}
                          onClick={() =>
                            void patchExam(
                              ex.local_id,
                              { active: !ex.active },
                              ex.active ? "Exam stopped" : "Exam started"
                            )
                          }
                        >
                          {ex.active ? "Stop" : "Start"}
                        </button>
                        <button
                          type="button"
                          className="pt-btn pt-btn--sm"
                          disabled={busy}
                          onClick={() =>
                            void patchExam(
                              ex.local_id,
                              { is_paused_all: !ex.is_paused_all },
                              ex.is_paused_all ? "Exam resumed" : "Exam paused"
                            )
                          }
                        >
                          {ex.is_paused_all ? <PIconPlay size={13} /> : <PIconPause size={13} />}
                          <span>{ex.is_paused_all ? "Resume" : "Pause"}</span>
                        </button>
                        <button
                          type="button"
                          className="pt-btn pt-btn--sm"
                          disabled={busy}
                          onClick={() =>
                            void patchExam(
                              ex.local_id,
                              { results_released: !ex.results_released },
                              ex.results_released ? "Scores withheld" : "Scores released"
                            )
                          }
                        >
                          {ex.results_released ? "Withhold" : "Release"}
                        </button>
                        <button
                          type="button"
                          className="pt-btn pt-btn--ghost pt-btn--icon"
                          disabled={busy}
                          onClick={() => void deleteExam(ex.local_id)}
                          title="Delete exam"
                          aria-label={`Delete ${ex.name}`}
                        >
                          <PIconTrash size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <PortalShell
        roleLabel="Admin"
        schoolName={schoolName}
        schoolTermMeta={termMeta}
        userName={adminLabel}
        userSubtitle={`Administrator · ${schoolCode}`}
        activeId={nav}
        crumbLabel={crumbMap[nav]}
        pendingCount={pendingStudents.length}
        onClickBell={() => setNav("approvals")}
        navItems={[
          { id: "overview", group: "Workspace", label: "Overview", icon: <PIconHome size={16} /> },
          { id: "exams", group: "Workspace", label: "Exams", icon: <PIconDoc size={16} />, count: exams.length },
          { id: "results", group: "Workspace", label: "Results", icon: <PIconChart size={16} />, count: results.length },
          { id: "teachers", group: "People", label: "Teachers", icon: <PIconUser size={16} />, count: teachers.length },
          { id: "students", group: "People", label: "Students", icon: <PIconUsers size={16} />, count: approvedStudents.length },
          { id: "approvals", group: "People", label: "Approvals", icon: <PIconClock size={16} />, count: pendingStudents.length },
          { id: "portal", group: "Cloud & Account", label: "Online Portal", icon: <PIconPower size={16} /> },
          { id: "licence", group: "Cloud & Account", label: "Licence & Billing", icon: <PIconKey size={16} /> },
          { id: "backups", group: "Cloud & Account", label: "Cloud Backups", icon: <PIconCloud size={16} /> },
          { id: "referrals", group: "Cloud & Account", label: "Referrals", icon: <PIconGift size={16} /> },
        ]}
        onSelectNav={(id) => setNav(id as AdminNavId)}
        onSignOut={() => void handleSignOut()}
        commands={[
          { id: "cmd:exam", label: "Create new exam", hint: "Action", onSelect: () => setShowAddExam(true) },
          { id: "cmd:teacher", label: "Add teacher", hint: "Action", onSelect: () => setShowAddPerson("teacher") },
          { id: "cmd:student", label: "Add student", hint: "Action", onSelect: () => setShowAddPerson("student") },
          { id: "cmd:csv", label: "Export results CSV", hint: "Action", onSelect: () => downloadResultsCsv(results) },
        ]}
        footerAction={
          <button
            type="button"
            className="pt-btn pt-btn--sm"
            style={{ width: "100%" }}
            onClick={() => setNav("portal")}
          >
            <PIconLive size={14} />
            <span className="pt-hide-collapsed">
              Portal: {portalLive ? "Live" : "Off"}
            </span>
          </button>
        }
      >
        {/* Editorial School Header (Matches Offline admin.html) */}
        <header className="pt-page-head">
          <div>
            <h1>{schoolName}</h1>
            <div className="pt-meta-line">
              <span>{termMeta}</span>
              <span className="pt-meta-sep" />
              <span className="pt-mono">School ID {schoolCode}</span>
              <button
                type="button"
                className="pt-text-btn"
                style={{ fontSize: 12 }}
                onClick={copySchoolId}
                title="Copy School ID"
              >
                <PIconCopy size={12} />
                <span>{copiedCode ? "Copied" : "Copy"}</span>
              </button>
              <span className="pt-meta-sep" />
              <span className={`pt-status ${portalLive ? "is-live" : ""}`}>
                <span className="pt-dot" />
                {portalLive ? "Online Portal Live" : "Online Portal Off"}
              </span>
            </div>
          </div>

          <div className="pt-page-head__actions">
            <button type="button" className="pt-btn" onClick={() => setNav("portal")}>
              <PIconPower size={15} />
              <span>Online Control</span>
            </button>
            <button type="button" className="pt-btn" onClick={() => setShowAddPerson("teacher")}>
              <PIconUser size={15} />
              <span>Add Teacher</span>
            </button>
            <button type="button" className="pt-btn pt-btn--primary" onClick={() => setShowAddPerson("student")}>
              <PIconUsers size={15} />
              <span>Add Student</span>
            </button>
          </div>
        </header>

        {toast ? <div className="pt-alert pt-alert--dark">{toast}</div> : null}

        {nav === "overview" ? (
          <>
            {/* 4-Column Typographic KPI Strip (Exact Match to Offline admin.html) */}
            <section className="pt-kpi-rail" aria-label="School overview numbers">
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">Total Exams</span>
                <strong className="pt-kpi-cell__val">{exams.length}</strong>
                <div className="pt-kpi-cell__meta">
                  <span className={`pt-status ${activeExamsCount > 0 ? "is-live" : ""}`}>
                    <span className="pt-dot" />
                    {activeExamsCount} active
                  </span>
                  <button type="button" className="pt-kpi-link" onClick={() => setNav("exams")}>
                    <span>Directory</span>
                    <PIconArrowRight size={13} />
                  </button>
                </div>
              </div>
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">Approved Students</span>
                <strong className="pt-kpi-cell__val">{approvedStudents.length}</strong>
                <div className="pt-kpi-cell__meta">
                  <span>Enrolled this session</span>
                  <button type="button" className="pt-kpi-link" onClick={() => setNav("students")}>
                    <span>Roster</span>
                    <PIconArrowRight size={13} />
                  </button>
                </div>
              </div>
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">Teachers</span>
                <strong className="pt-kpi-cell__val">{teachers.length}</strong>
                <div className="pt-kpi-cell__meta">
                  <span>Faculty accounts</span>
                  <button type="button" className="pt-kpi-link" onClick={() => setNav("teachers")}>
                    <span>Manage</span>
                    <PIconArrowRight size={13} />
                  </button>
                </div>
              </div>
              <div className="pt-kpi-cell">
                <span className="pt-kpi-cell__label">Pending Approvals</span>
                <strong className="pt-kpi-cell__val">{pendingStudents.length}</strong>
                <div className="pt-kpi-cell__meta">
                  <span>{pendingStudents.length > 0 ? "Action needed" : "All caught up"}</span>
                  <button type="button" className="pt-kpi-link" onClick={() => setNav("approvals")}>
                    <span>Review</span>
                    <PIconArrowRight size={13} />
                  </button>
                </div>
              </div>
            </section>

            {/* Examinations Directory */}
            {renderExamsTable()}
          </>
        ) : nav === "exams" ? (
          renderExamsTable()
        ) : nav === "results" ? (
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>Examination Results</h2>
                <p>Online and synced student scores across the school</p>
              </div>
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                disabled={results.length === 0}
                onClick={() => downloadResultsCsv(results)}
              >
                <PIconDownload size={13} />
                <span>Export CSV</span>
              </button>
            </div>
            {results.length === 0 ? (
              <div className="pt-empty">
                <span className="pt-empty__ico">
                  <PIconChart size={18} />
                </span>
                <strong>No exam attempts recorded yet</strong>
                <p>Completed online and synced offline attempts will appear here.</p>
              </div>
            ) : (
              <div className="pt-table-wrap">
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Examination</th>
                      <th>Score</th>
                      <th>Grade</th>
                      <th>PC Sync</th>
                      <th style={{ textAlign: "right" }}>Controls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong style={{ display: "block", fontWeight: 600 }}>{r.student_name}</strong>
                          <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                            @{r.student_username} · {r.student_class}
                          </span>
                        </td>
                        <td>{r.exam_name}</td>
                        <td className="pt-mono">
                          {r.submitted ? `${r.score} / ${r.total} (${r.percentage}%)` : "In progress"}
                        </td>
                        <td className="pt-mono" style={{ fontWeight: 600 }}>
                          {r.submitted ? r.grade_label || "-" : "-"}
                        </td>
                        <td>
                          <span className={`pt-status ${r.synced_to_desktop ? "is-live" : ""}`}>
                            <span className="pt-dot" />
                            {r.origin === "offline"
                              ? "Offline"
                              : r.synced_to_desktop
                                ? "Pulled to PC"
                                : "Pending PC pull"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {!r.submitted ? (
                            <button
                              type="button"
                              className="pt-btn pt-btn--primary pt-btn--sm"
                              disabled={busy}
                              onClick={() => void handleResultAction(r.id, "force_submit")}
                            >
                              Force Submit
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pt-btn pt-btn--sm"
                              disabled={busy}
                              onClick={() =>
                                void handleResultAction(r.id, "toggle_release", { release: !r.results_released })
                              }
                            >
                              {r.results_released ? "Withhold" : "Release"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : nav === "teachers" ? (
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>Teachers</h2>
                <p>Faculty accounts able to sign in and author exams when teacher access is turned on</p>
              </div>
              <button type="button" className="pt-btn pt-btn--primary pt-btn--sm" onClick={() => setShowAddPerson("teacher")}>
                <PIconPlus size={13} />
                <span>Add Teacher</span>
              </button>
            </div>
            {teachers.length === 0 ? (
              <div className="pt-empty">
                <span className="pt-empty__ico">
                  <PIconUser size={18} />
                </span>
                <strong>No teacher accounts synced yet</strong>
                <p>Sync a cloud backup or add a teacher account directly.</p>
              </div>
            ) : (
              <div className="pt-table-wrap">
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Full Name</th>
                      <th>Username</th>
                      <th>Assigned Classes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((t) => (
                      <tr key={t.local_id}>
                        <td style={{ fontWeight: 600 }}>{t.full_name}</td>
                        <td className="pt-mono">@{t.username}</td>
                        <td style={{ color: "var(--pt-ink-2)" }}>
                          {Array.isArray(t.classes_json) && t.classes_json.length
                            ? t.classes_json.join(", ")
                            : t.primary_class || "All"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : nav === "students" ? (
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>Students</h2>
                <p>Enrolled student accounts synced with your school database</p>
              </div>
              <button type="button" className="pt-btn pt-btn--primary pt-btn--sm" onClick={() => setShowAddPerson("student")}>
                <PIconPlus size={13} />
                <span>Add Student</span>
              </button>
            </div>
            {students.length === 0 ? (
              <div className="pt-empty">
                <span className="pt-empty__ico">
                  <PIconUsers size={18} />
                </span>
                <strong>No student accounts synced yet</strong>
                <p>Sync a cloud backup or add a student account directly.</p>
              </div>
            ) : (
              <div className="pt-table-wrap">
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((st) => (
                      <tr key={st.local_id}>
                        <td>
                          <strong style={{ display: "block", fontWeight: 600 }}>{st.full_name}</strong>
                          <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                            @{st.username}
                          </span>
                        </td>
                        <td>{st.student_class || "-"}</td>
                        <td>
                          <span className={`pt-status ${st.status === "approved" ? "is-live" : ""}`}>
                            <span className="pt-dot" />
                            {st.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {st.status !== "approved" ? (
                            <button
                              type="button"
                              className="pt-btn pt-btn--primary pt-btn--sm"
                              disabled={busy}
                              onClick={() => void updateStudentStatus(st.local_id, "approved")}
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="pt-btn pt-btn--ghost pt-btn--sm"
                              disabled={busy}
                              onClick={() => void updateStudentStatus(st.local_id, "suspended")}
                            >
                              Suspend
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : nav === "approvals" ? (
          <section className="pt-card">
            <div className="pt-card__head">
              <div className="pt-card__title">
                <h2>Pending Student Approvals</h2>
                <p>Approve students before they can sign in and sit examinations</p>
              </div>
              <span className="pt-mono" style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                {pendingStudents.length} pending
              </span>
            </div>
            {pendingStudents.length === 0 ? (
              <div className="pt-empty">
                <span className="pt-empty__ico">
                  <PIconCheck size={18} />
                </span>
                <strong>All student registrations are approved</strong>
                <p>New pending student accounts will appear here for review.</p>
              </div>
            ) : (
              <div className="pt-table-wrap">
                <table className="pt-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingStudents.map((st) => (
                      <tr key={st.local_id}>
                        <td>
                          <strong style={{ display: "block", fontWeight: 600 }}>{st.full_name}</strong>
                          <span className="pt-mono" style={{ fontSize: 11.5, color: "var(--pt-ink-3)" }}>
                            @{st.username}
                          </span>
                        </td>
                        <td>{st.student_class || "-"}</td>
                        <td>
                          <span className="pt-status">
                            <span className="pt-dot" />
                            {st.status}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="pt-btn pt-btn--primary pt-btn--sm"
                            disabled={busy}
                            onClick={() => void updateStudentStatus(st.local_id, "approved")}
                          >
                            Approve Student
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : nav === "portal" ? (
          <PortalPowerDial onSynced={() => void loadAll()} />
        ) : (
          <AdminCloudViews
            section={nav}
            account={cloudAccount}
            payments={cloudPayments}
            backups={cloudBackups}
            referrals={cloudReferrals}
            loadingCloud={loadingCloud}
            onRefreshAll={loadAll}
            onNotify={notify}
          />
        )}
      </PortalShell>

      {/* Create Exam Modal */}
      {showAddExam ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create Exam">
          <div className="pt-modal pt-modal--wide" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>Create Online Exam</h2>
              <button type="button" className="pt-btn pt-btn--sm" onClick={() => setShowAddExam(false)}>
                Close
              </button>
            </div>
            <form className="pt-form" onSubmit={handleCreateExam}>
              <div className="pt-field">
                <label htmlFor="admExName">Exam title</label>
                <input
                  id="admExName"
                  className="pt-input"
                  required
                  value={exName}
                  onChange={(e) => setExName(e.target.value)}
                  placeholder="First Term Physics Examination"
                />
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="admExClass">Class</label>
                  {classes.length ? (
                    <select id="admExClass" className="pt-select" value={exClass} onChange={(e) => setExClass(e.target.value)}>
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="All">All Classes</option>
                    </select>
                  ) : (
                    <input
                      id="admExClass"
                      className="pt-input"
                      required
                      value={exClass}
                      onChange={(e) => setExClass(e.target.value)}
                      placeholder="SS1"
                    />
                  )}
                </div>
                <div className="pt-field">
                  <label htmlFor="admExDur">Duration (minutes)</label>
                  <input
                    id="admExDur"
                    type="number"
                    min={1}
                    max={360}
                    className="pt-input"
                    value={exDur}
                    onChange={(e) => setExDur(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="admExCalc">Calculator</label>
                  <select
                    id="admExCalc"
                    className="pt-select"
                    value={exCalc}
                    onChange={(e) => setExCalc(e.target.value as "none" | "basic" | "scientific")}
                  >
                    <option value="none">None</option>
                    <option value="basic">Basic</option>
                    <option value="scientific">Scientific</option>
                  </select>
                </div>
                <div className="pt-field" style={{ justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, cursor: "pointer" }}>
                    <input type="checkbox" checked={exActive} onChange={(e) => setExActive(e.target.checked)} />
                    Activate immediately
                  </label>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="pt-btn" onClick={() => setShowAddExam(false)}>
                  Cancel
                </button>
                <button type="submit" className="pt-btn pt-btn--primary" disabled={busy}>
                  {busy ? "Creating..." : "Create & Add Questions"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Add Student / Teacher Modal */}
      {showAddPerson ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Add ${showAddPerson}`}>
          <div className="pt-modal pt-modal--wide" style={{ maxWidth: 440 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0 }}>{showAddPerson === "teacher" ? "Add Teacher" : "Add Student"}</h2>
              <button type="button" className="pt-btn pt-btn--sm" onClick={() => setShowAddPerson(null)}>
                Close
              </button>
            </div>
            <form className="pt-form" onSubmit={handleAddPerson}>
              <div className="pt-field">
                <label htmlFor="pFull">Full name</label>
                <input id="pFull" className="pt-input" required value={pName} onChange={(e) => setPName(e.target.value)} />
              </div>
              <div className="pt-field">
                <label htmlFor="pUser">Username</label>
                <input id="pUser" className="pt-input" required value={pUser} onChange={(e) => setPUser(e.target.value)} />
              </div>
              <div className="pt-field">
                <label htmlFor="pPass">Password</label>
                <input
                  id="pPass"
                  type="password"
                  className="pt-input"
                  required
                  minLength={4}
                  value={pPass}
                  onChange={(e) => setPPass(e.target.value)}
                />
              </div>
              <div className="pt-field">
                <label htmlFor="pCls">{showAddPerson === "teacher" ? "Classes (comma separated)" : "Class"}</label>
                <input
                  id="pCls"
                  className="pt-input"
                  required
                  value={pClass}
                  onChange={(e) => setPClass(e.target.value)}
                  placeholder="SS1"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="pt-btn" onClick={() => setShowAddPerson(null)}>
                  Cancel
                </button>
                <button type="submit" className="pt-btn pt-btn--primary" disabled={busy}>
                  {busy ? "Saving..." : "Save Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {authorExam ? (
        <QuestionAuthorModal
          examId={authorExam.id}
          examName={authorExam.name}
          onClose={() => setAuthorExam(null)}
          onChanged={() => void loadAll()}
        />
      ) : null}
    </>
  );
}
