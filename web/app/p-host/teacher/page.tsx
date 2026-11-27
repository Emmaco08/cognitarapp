"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CogniTaraLockup } from "@/components/CogniTaraLogo";
import { QuestionAuthorModal } from "@/components/portal/QuestionAuthorModal";

interface PortalExamRow {
  local_id: number;
  name: string;
  exam_class: string;
  duration: number;
  active: boolean;
  is_paused_all: boolean;
  calculator_type: string;
  max_warnings: number;
  result_release_policy: string;
  results_released: boolean;
  question_count: number;
  submission_count: number;
  live_count: number;
  avg_percentage: number | null;
  created_online: boolean;
}

interface PortalResultRow {
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
  status: string;
  submitted: boolean;
  warnings_count: number;
  results_released: boolean;
  origin: string;
  completed_at: string | null;
}

function downloadCsv(filename: string, rows: PortalResultRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Student", "Username", "Class", "Exam", "Score", "Total", "Percent", "Grade", "Status", "Origin"].map(esc).join(","),
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
        r.submitted ? "Submitted" : "In Progress",
        r.origin,
      ]
        .map(esc)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function TeacherOnlineStudioPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"exams" | "results">("exams");
  const [school, setSchool] = useState<{ school_code: string; portal_school_name: string; academic_session: string; current_term: string } | null>(null);
  const [teacherName, setTeacherName] = useState("");
  const [classes, setClasses] = useState<string[]>([]);
  const [exams, setExams] = useState<PortalExamRow[]>([]);
  const [results, setResults] = useState<PortalResultRow[]>([]);
  const [filterExamId, setFilterExamId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  // Create exam modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClass, setNewClass] = useState("");
  const [newDuration, setNewDuration] = useState(40);
  const [newCalc, setNewCalc] = useState<"none" | "basic" | "scientific">("none");
  const [newWarnings, setNewWarnings] = useState(5);
  const [newPolicy, setNewPolicy] = useState<"immediate" | "withheld">("immediate");
  const [newActive, setNewActive] = useState(false);
  const [busy, setBusy] = useState(false);

  // Question author modal
  const [authorExam, setAuthorExam] = useState<{ id: number; name: string } | null>(null);

  function showToast(t: string) {
    setToast(t);
    setTimeout(() => setToast((cur) => (cur === t ? "" : cur)), 3200);
  }

  async function loadAll() {
    try {
      const [meRes, exRes, resRes] = await Promise.all([
        fetch("/api/v1/portal/auth/me", { credentials: "include" }).then((r) => r.json()).catch(() => null),
        fetch("/api/v1/portal/exams", { credentials: "include" }),
        fetch("/api/v1/portal/results", { credentials: "include" }),
      ]);
      if (exRes.status === 401) {
        router.replace("/");
        return;
      }
      const exJson = await exRes.json().catch(() => ({}));
      if (exRes.status === 403 || !exRes.ok || !exJson.ok) {
        setErr(exJson.message || "Teacher online access is currently unavailable.");
        return;
      }
      setSchool(exJson.school || null);
      const cls: string[] = Array.isArray(exJson.classes) ? exJson.classes : [];
      setClasses(cls);
      if (!newClass && cls.length) setNewClass(cls[0]);
      setExams(Array.isArray(exJson.exams) ? exJson.exams : []);
      if (meRes?.session?.fullName) setTeacherName(String(meRes.session.fullName));

      const resJson = await resRes.json().catch(() => ({}));
      if (resRes.ok && resJson.ok && Array.isArray(resJson.results)) {
        setResults(resJson.results);
      }
    } catch {
      setErr("Could not load Teacher Studio.");
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
    router.replace(school?.school_code ? `/?school=${encodeURIComponent(school.school_code)}` : "/");
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
          name: newName,
          exam_class: newClass,
          duration: Number(newDuration),
          calculator_type: newCalc,
          max_warnings: Number(newWarnings),
          result_release_policy: newPolicy,
          active: newActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data.message || "Could not create exam.");
      } else {
        setShowCreate(false);
        setNewName("");
        showToast("Exam created. Add questions now.");
        await loadAll();
        if (data.exam?.local_id) {
          setAuthorExam({ id: Number(data.exam.local_id), name: String(data.exam.name) });
        }
      }
    } finally {
      setBusy(false);
    }
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
        showToast(label);
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
        showToast("Exam deleted.");
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function resultAction(attemptId: string, action: "force_submit" | "toggle_release", extra: Record<string, unknown> = {}) {
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
        showToast(data.message || "Updated.");
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  const filteredResults = filterExamId
    ? results.filter((r) => String(r.exam_local_id) === filterExamId)
    : results;

  return (
    <>
      <header className="pt-topbar">
        <div className="pt-topbar-inner">
          <div className="pt-brand-link">
            <CogniTaraLockup markSize={20} wordmarkHeight={15} suffix="Teacher Studio" />
            {school ? <span className="pt-pill pt-pill--mono">{school.school_code}</span> : null}
          </div>
          <div className="pt-topbar-meta">
            {teacherName ? <span className="pt-pill">{teacherName}</span> : null}
            <button type="button" className="pt-btn pt-btn--sm" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="pt-wrap">
        {loading ? (
          <div className="pt-card" style={{ textAlign: "center", padding: 36, color: "var(--pt-ink-2)" }}>
            Loading Teacher Online Studio...
          </div>
        ) : err ? (
          <div className="pt-card" style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
            <div className="pt-alert pt-alert--dark" style={{ marginBottom: 16 }}>
              {err}
            </div>
            <Link href="/" className="pt-btn pt-btn--primary">
              Back to School Portal
            </Link>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)", fontWeight: 600 }}>
                  {school?.portal_school_name} · {school?.academic_session} · {school?.current_term}
                </div>
                <h1 style={{ margin: "4px 0 0", fontSize: 25, fontWeight: 700, letterSpacing: "-0.025em" }}>
                  Teacher Online Studio
                </h1>
              </div>
              <button
                type="button"
                className="pt-btn pt-btn--primary"
                onClick={() => setShowCreate(true)}
              >
                + Create New Exam
              </button>
            </div>

            {toast ? (
              <div className="pt-alert pt-alert--dark" style={{ marginBottom: 16 }}>
                {toast}
              </div>
            ) : null}

            <div className="pt-tabs">
              <button type="button" className={`pt-tab ${tab === "exams" ? "is-active" : ""}`} onClick={() => setTab("exams")}>
                My Exams ({exams.length})
              </button>
              <button type="button" className={`pt-tab ${tab === "results" ? "is-active" : ""}`} onClick={() => setTab("results")}>
                Student Results ({results.length})
              </button>
            </div>

            {tab === "exams" ? (
              exams.length === 0 ? (
                <div className="pt-card" style={{ textAlign: "center", padding: 36, color: "var(--pt-ink-2)" }}>
                  No exams yet. Click &ldquo;Create New Exam&rdquo; to set your first online exam from home.
                </div>
              ) : (
                <div className="pt-table-wrap">
                  <table className="pt-table">
                    <thead>
                      <tr>
                        <th>Exam</th>
                        <th>Class</th>
                        <th>Duration</th>
                        <th>Questions</th>
                        <th>Submissions</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exams.map((ex) => (
                        <tr key={ex.local_id}>
                          <td>
                            <strong>{ex.name}</strong>
                            <div style={{ fontSize: 12, color: "var(--pt-ink-2)" }}>
                              Calc: {ex.calculator_type} · {ex.results_released ? "Scores visible" : "Scores withheld"}
                            </div>
                          </td>
                          <td>{ex.exam_class || "All"}</td>
                          <td>{ex.duration} min</td>
                          <td>{ex.question_count}</td>
                          <td>
                            {ex.submission_count}
                            {ex.live_count > 0 ? <span className="pt-pill" style={{ marginLeft: 6 }}>{ex.live_count} live</span> : null}
                          </td>
                          <td>
                            <span className={`pt-pill ${ex.active ? "pt-pill--dark" : ""}`}>
                              {ex.is_paused_all ? "Paused" : ex.active ? "Active" : "Draft"}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="pt-btn pt-btn--primary pt-btn--sm"
                                onClick={() => setAuthorExam({ id: ex.local_id, name: ex.name })}
                              >
                                Questions
                              </button>
                              <button
                                type="button"
                                className="pt-btn pt-btn--sm"
                                disabled={busy}
                                onClick={() => patchExam(ex.local_id, { active: !ex.active }, ex.active ? "Exam set to Draft." : "Exam is now Active.")}
                              >
                                {ex.active ? "Deactivate" : "Activate"}
                              </button>
                              <button
                                type="button"
                                className="pt-btn pt-btn--sm"
                                disabled={busy}
                                onClick={() =>
                                  patchExam(
                                    ex.local_id,
                                    { is_paused_all: !ex.is_paused_all },
                                    ex.is_paused_all ? "Exam resumed." : "Exam paused for all live students."
                                  )
                                }
                              >
                                {ex.is_paused_all ? "Resume" : "Pause"}
                              </button>
                              <button
                                type="button"
                                className="pt-btn pt-btn--ghost pt-btn--sm"
                                disabled={busy}
                                onClick={() => void deleteExam(ex.local_id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                  <select
                    className="pt-select"
                    style={{ maxWidth: 280 }}
                    value={filterExamId}
                    onChange={(e) => setFilterExamId(e.target.value)}
                  >
                    <option value="">All Exams</option>
                    {exams.map((ex) => (
                      <option key={ex.local_id} value={String(ex.local_id)}>
                        {ex.name} ({ex.exam_class})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="pt-btn pt-btn--sm"
                    disabled={filteredResults.length === 0}
                    onClick={() => downloadCsv("cognitara-online-results.csv", filteredResults)}
                  >
                    Export CSV
                  </button>
                </div>

                {filteredResults.length === 0 ? (
                  <div className="pt-card" style={{ textAlign: "center", padding: 32, color: "var(--pt-ink-2)" }}>
                    No student submissions recorded yet.
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
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredResults.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.student_name}</strong>
                              <div style={{ fontSize: 12, color: "var(--pt-ink-2)" }}>
                                {r.student_username} · {r.student_class || "N/A"}
                              </div>
                            </td>
                            <td>{r.exam_name}</td>
                            <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                              {r.submitted ? `${r.score}/${r.total} (${r.percentage}%)` : "In progress"}
                            </td>
                            <td>{r.submitted ? r.grade_label || "-" : "-"}</td>
                            <td>
                              <span className={`pt-pill ${r.submitted ? "pt-pill--dark" : ""}`}>
                                {r.submitted ? r.origin : "Live"}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                {!r.submitted ? (
                                  <button
                                    type="button"
                                    className="pt-btn pt-btn--sm"
                                    disabled={busy}
                                    onClick={() => void resultAction(r.id, "force_submit")}
                                  >
                                    Force Submit
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="pt-btn pt-btn--sm"
                                    disabled={busy}
                                    onClick={() =>
                                      void resultAction(r.id, "toggle_release", {
                                        results_released: !r.results_released,
                                      })
                                    }
                                  >
                                    {r.results_released ? "Withhold" : "Release"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Create New Exam Modal */}
      {showCreate ? (
        <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create New Exam">
          <div className="pt-modal pt-modal--wide">
            <h2 style={{ marginBottom: 16 }}>Create New Online Exam</h2>
            <form className="pt-form" onSubmit={handleCreateExam}>
              <div className="pt-field">
                <label htmlFor="exTitle">Exam Title</label>
                <input
                  id="exTitle"
                  className="pt-input"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Second Term Mathematics CA"
                />
              </div>

              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="exClass">Target Class</label>
                  <input
                    id="exClass"
                    className="pt-input"
                    list="portalClassOptions"
                    required
                    value={newClass}
                    onChange={(e) => setNewClass(e.target.value)}
                    placeholder="e.g. SS1 or JSS2"
                  />
                  <datalist id="portalClassOptions">
                    {classes.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="pt-field">
                  <label htmlFor="exDur">Duration (minutes)</label>
                  <input
                    id="exDur"
                    type="number"
                    min={1}
                    max={360}
                    className="pt-input"
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="exCalc">Calculator</label>
                  <select
                    id="exCalc"
                    className="pt-select"
                    value={newCalc}
                    onChange={(e) => setNewCalc(e.target.value as "none" | "basic" | "scientific")}
                  >
                    <option value="none">Disabled</option>
                    <option value="basic">Basic Calculator</option>
                    <option value="scientific">Scientific Calculator</option>
                  </select>
                </div>
                <div className="pt-field">
                  <label htmlFor="exWarn">Max Tab Warnings</label>
                  <input
                    id="exWarn"
                    type="number"
                    min={1}
                    max={20}
                    className="pt-input"
                    value={newWarnings}
                    onChange={(e) => setNewWarnings(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="pt-form-grid-2">
                <div className="pt-field">
                  <label htmlFor="exPolicy">Score Visibility</label>
                  <select
                    id="exPolicy"
                    className="pt-select"
                    value={newPolicy}
                    onChange={(e) => setNewPolicy(e.target.value as "immediate" | "withheld")}
                  >
                    <option value="immediate">Show Score Immediately</option>
                    <option value="withheld">Withhold Until Released</option>
                  </select>
                </div>
                <div className="pt-field" style={{ justifyContent: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingTop: 22 }}>
                    <input
                      type="checkbox"
                      checked={newActive}
                      onChange={(e) => setNewActive(e.target.checked)}
                    />
                    Activate immediately for students
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <button type="button" className="pt-btn" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className="pt-btn pt-btn--primary" disabled={busy}>
                  {busy ? "Creating..." : "Create Exam"}
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
