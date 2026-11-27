"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CogniTaraLockup } from "@/components/CogniTaraLogo";
import { PortalPowerDial } from "@/components/portal/PortalPowerDial";
import { QuestionAuthorModal } from "@/components/portal/QuestionAuthorModal";

interface AdminExamRow {
  local_id: number;
  name: string;
  exam_class: string;
  teacher_name: string | null;
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

function downloadResultsCsv(rows: AdminResultRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Student", "Username", "Class", "Exam", "Score", "Total", "Percent", "Grade", "Origin", "SyncedToDesktop"].map(esc).join(","),
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
  a.download = "cognitara-school-online-results.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminOnlineControlCenterPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"exams" | "results" | "people">("exams");
  const [authOk, setAuthOk] = useState(false);
  const [adminLabel, setAdminLabel] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [exams, setExams] = useState<AdminExamRow[]>([]);
  const [results, setResults] = useState<AdminResultRow[]>([]);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [teachers, setTeachers] = useState<RosterTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

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
    setTimeout(() => setToast((cur) => (cur === msg ? "" : cur)), 3200);
  }

  async function loadAll() {
    try {
      const meRes = await fetch("/api/v1/portal/auth/me", { credentials: "include" }).then((r) => r.json()).catch(() => null);
      if (!meRes?.authenticated || meRes.session?.role !== "admin") {
        router.replace("/");
        return;
      }
      setAuthOk(true);
      setAdminLabel(String(meRes.session.fullName || meRes.session.username));
      setSchoolCode(String(meRes.session.schoolCode || ""));

      const [exRes, resRes, rosRes] = await Promise.all([
        fetch("/api/v1/portal/exams", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/portal/results", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/v1/portal/roster", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (exRes?.ok) {
        setExams(Array.isArray(exRes.exams) ? exRes.exams : []);
        const cls: string[] = Array.isArray(exRes.classes) ? exRes.classes : [];
        setClasses(cls);
        if (!exClass && cls.length) setExClass(cls[0]);
        if (!pClass && cls.length) setPClass(cls[0]);
      }
      if (resRes?.ok && Array.isArray(resRes.results)) setResults(resRes.results);
      if (rosRes?.ok) {
        setStudents(Array.isArray(rosRes.students) ? rosRes.students : []);
        setTeachers(Array.isArray(rosRes.teachers) ? rosRes.teachers : []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
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
        notify("Exam created.");
        await loadAll();
        if (data.exam?.local_id) {
          setAuthorExam({ id: Number(data.exam.local_id), name: String(data.exam.name) });
        }
      } else {
        notify(data.message || "Could not create exam.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResultAction(attemptId: string, action: "force_submit" | "toggle_release", extra: Record<string, unknown> = {}) {
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
        notify(data.message || "Updated.");
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
        notify(`Student ${status}.`);
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
        notify(data.message || "Added.");
        await loadAll();
      } else {
        notify(data.message || "Could not add account.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading || !authOk) {
    return (
      <div className="pt-gateway-page">
        <div className="pt-modal">
          <h2>Loading Admin Control Center...</h2>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          <div className="pt-brand-link">
            <CogniTaraLockup markSize={20} wordmarkHeight={15} suffix="Admin" />
            {schoolCode ? <span className="pt-pill pt-pill--mono pt-pill--dark">{schoolCode}</span> : null}
          </div>
          <div className="pt-topbar-meta">
            <span className="pt-pill pt-hide-sm">{adminLabel}</span>
            <a
              href="https://cognitara.net/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="pt-btn pt-btn--ghost pt-btn--sm"
            >
              Cloud Dashboard
            </a>
            <button type="button" className="pt-btn pt-btn--sm" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="pt-wrap" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Master Online Portal ON/OFF Power Dial + Role Toggles */}
        <PortalPowerDial onSynced={() => void loadAll()} />

        {toast ? <div className="pt-alert pt-alert--dark">{toast}</div> : null}

        {/* School Management Tabs */}
        <div>
          <div className="pt-tabs">
            <button type="button" className={`pt-tab ${tab === "exams" ? "is-active" : ""}`} onClick={() => setTab("exams")}>
              Exams ({exams.length})
            </button>
            <button type="button" className={`pt-tab ${tab === "results" ? "is-active" : ""}`} onClick={() => setTab("results")}>
              Results ({results.length})
            </button>
            <button type="button" className={`pt-tab ${tab === "people" ? "is-active" : ""}`} onClick={() => setTab("people")}>
              Students & Teachers ({students.length + teachers.length})
            </button>
          </div>

          {tab === "exams" ? (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button type="button" className="pt-btn pt-btn--primary pt-btn--sm" onClick={() => setShowAddExam(true)}>
                  + Create Exam
                </button>
              </div>
              {exams.length === 0 ? (
                <div className="pt-card" style={{ textAlign: "center", padding: 32, color: "var(--pt-ink-2)" }}>
                  No exams synced yet. Click &ldquo;Sync Latest Cloud Backup&rdquo; above or create an exam directly.
                </div>
              ) : (
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Exam</th>
                        <th>Class</th>
                        <th>Questions</th>
                        <th>Taken</th>
                        <th>Status</th>
                        <th>Controls</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exams.map((ex) => (
                        <tr key={ex.local_id}>
                          <td>
                            <strong>{ex.name}</strong>
                            <div style={{ fontSize: 12, color: "var(--pt-ink-2)" }}>
                              {ex.duration} min · {ex.teacher_name || "Admin"}
                            </div>
                          </td>
                          <td>{ex.exam_class || "All"}</td>
                          <td>{ex.question_count}</td>
                          <td>
                            {ex.submission_count}
                            {ex.live_count > 0 ? <span className="pt-pill" style={{ marginLeft: 6 }}>{ex.live_count} live</span> : null}
                          </td>
                          <td>
                            <span className={`pt-pill ${ex.active ? "pt-pill--dark" : ""}`}>
                              {ex.is_paused_all ? "Paused" : ex.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                                onClick={() => patchExam(ex.local_id, { active: !ex.active }, ex.active ? "Exam deactivated." : "Exam activated.")}
                              >
                                {ex.active ? "Turn Off" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="pt-btn pt-btn--sm"
                                disabled={busy}
                                onClick={() =>
                                  patchExam(
                                    ex.local_id,
                                    { is_paused_all: !ex.is_paused_all },
                                    ex.is_paused_all ? "Exam resumed." : "Exam paused."
                                  )
                                }
                              >
                                {ex.is_paused_all ? "Resume" : "Pause"}
                              </button>
                              <button
                                type="button"
                                className="pt-btn pt-btn--sm"
                                disabled={busy}
                                onClick={() =>
                                  patchExam(
                                    ex.local_id,
                                    { results_released: !ex.results_released },
                                    ex.results_released ? "Results withheld." : "Results released."
                                  )
                                }
                              >
                                {ex.results_released ? "Withhold Scores" : "Release Scores"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : tab === "results" ? (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                <button
                  type="button"
                  className="pt-btn pt-btn--sm"
                  disabled={results.length === 0}
                  onClick={() => downloadResultsCsv(results)}
                >
                  Export Broadsheet CSV
                </button>
              </div>
              {results.length === 0 ? (
                <div className="pt-card" style={{ textAlign: "center", padding: 32, color: "var(--pt-ink-2)" }}>
                  No exam attempts recorded yet.
                </div>
              ) : (
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Exam</th>
                        <th>Score</th>
                        <th>Grade</th>
                        <th>Source</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{r.student_name}</strong>
                            <div style={{ fontSize: 12, color: "var(--pt-ink-2)" }}>
                              {r.student_username} · {r.student_class || "N/A"}
                            </div>
                          </td>
                          <td>{r.exam_name}</td>
                          <td style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                            {r.submitted ? `${r.score}/${r.total} (${r.percentage}%)` : "In Progress"}
                          </td>
                          <td>{r.submitted ? r.grade_label || "-" : "-"}</td>
                          <td>
                            <span className={`pt-pill ${r.origin === "online" ? "pt-pill--dark" : ""}`}>
                              {r.origin === "online" ? (r.synced_to_desktop ? "Online · Synced" : "Online · New") : "Desktop"}
                            </span>
                          </td>
                          <td>
                            {!r.submitted ? (
                              <button
                                type="button"
                                className="pt-btn pt-btn--sm"
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
                                  void handleResultAction(r.id, "toggle_release", {
                                    results_released: !r.results_released,
                                  })
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
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="pt-btn pt-btn--sm" onClick={() => setShowAddPerson("teacher")}>
                  + Add Teacher
                </button>
                <button type="button" className="pt-btn pt-btn--primary pt-btn--sm" onClick={() => setShowAddPerson("student")}>
                  + Add Student
                </button>
              </div>

              <div>
                <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Students ({students.length})</h3>
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Class</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.slice(0, 100).map((st) => (
                        <tr key={st.local_id}>
                          <td><strong>{st.full_name}</strong></td>
                          <td><code>{st.username}</code></td>
                          <td>{st.student_class || "-"}</td>
                          <td>
                            <span className={`pt-pill ${st.status === "approved" ? "pt-pill--dark" : ""}`}>
                              {st.status}
                            </span>
                          </td>
                          <td>
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
                                className="pt-btn pt-btn--sm"
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
              </div>

              <div>
                <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Teachers ({teachers.length})</h3>
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Classes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teachers.map((tc) => (
                        <tr key={tc.local_id}>
                          <td><strong>{tc.full_name}</strong></td>
                          <td><code>{tc.username}</code></td>
                          <td>{Array.isArray(tc.classes_json) && tc.classes_json.length ? tc.classes_json.join(", ") : tc.primary_class || "All"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Exam Modal */}
      {showAddExam ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create Exam">
          <div className="pt-modal pt-modal--wide">
            <h2 style={{ marginBottom: 16 }}>Create Online Exam</h2>
            <form className="pt-form" onSubmit={handleCreateExam}>
              <div className="pt-field">
                <label htmlFor="admExName">Exam Title</label>
                <input id="admExName" className="pt-input" required value={exName} onChange={(e) => setExName(e.target.value)} />
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="admExClass">Class</label>
                  <input id="admExClass" className="pt-input" list="admClasses" required value={exClass} onChange={(e) => setExClass(e.target.value)} />
                  <datalist id="admClasses">
                    {classes.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="pt-field">
                  <label htmlFor="admExDur">Duration (min)</label>
                  <input id="admExDur" type="number" min={1} max={360} className="pt-input" value={exDur} onChange={(e) => setExDur(Number(e.target.value))} />
                </div>
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="admExCalc">Calculator</label>
                  <select id="admExCalc" className="pt-select" value={exCalc} onChange={(e) => setExCalc(e.target.value as "none" | "basic" | "scientific")}>
                    <option value="none">Disabled</option>
                    <option value="basic">Basic</option>
                    <option value="scientific">Scientific</option>
                  </select>
                </div>
                <div className="pt-field" style={{ justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 20 }}>
                    <input type="checkbox" checked={exActive} onChange={(e) => setExActive(e.target.checked)} />
                    Active immediately
                  </label>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="pt-btn" onClick={() => setShowAddExam(false)}>Cancel</button>
                <button type="submit" className="pt-btn pt-btn--primary" disabled={busy}>{busy ? "Saving..." : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Add Student / Teacher Modal */}
      {showAddPerson ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Add ${showAddPerson}`}>
          <div className="pt-modal pt-modal--wide">
            <h2 style={{ marginBottom: 16 }}>Add {showAddPerson === "teacher" ? "Teacher" : "Student"}</h2>
            <form className="pt-form" onSubmit={handleAddPerson}>
              <div className="pt-field">
                <label htmlFor="pName">Full Name</label>
                <input id="pName" className="pt-input" required value={pName} onChange={(e) => setPName(e.target.value)} />
              </div>
              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="pUser">Username</label>
                  <input id="pUser" className="pt-input" required value={pUser} onChange={(e) => setPUser(e.target.value)} />
                </div>
                <div className="pt-field">
                  <label htmlFor="pPass">Password</label>
                  <input id="pPass" type="text" className="pt-input" required minLength={4} value={pPass} onChange={(e) => setPPass(e.target.value)} />
                </div>
              </div>
              <div className="pt-field">
                <label htmlFor="pClass">{showAddPerson === "teacher" ? "Classes (comma separated)" : "Class"}</label>
                <input id="pClass" className="pt-input" value={pClass} onChange={(e) => setPClass(e.target.value)} placeholder="e.g. SS1" />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="pt-btn" onClick={() => setShowAddPerson(null)}>Cancel</button>
                <button type="submit" className="pt-btn pt-btn--primary" disabled={busy}>{busy ? "Saving..." : "Save Account"}</button>
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
