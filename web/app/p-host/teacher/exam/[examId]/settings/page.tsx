"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";

interface SectionRow {
  local_id: number;
  section_name: string;
  questions_to_show: number;
  randomize: boolean;
}

interface GroupRow {
  local_id: number;
  section_local_id: number | null;
  group_name: string;
  group_type: string;
  group_content: string;
  instruction_text: string;
}

export default function TeacherExamSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.examId || 0);

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [examClass, setExamClass] = useState("");
  const [specialisation, setSpecialisation] = useState("");
  const [subjectTag, setSubjectTag] = useState("");
  const [duration, setDuration] = useState(45);
  const [calculatorType, setCalculatorType] = useState("none");
  const [active, setActive] = useState(false);
  const [resultsReleased, setResultsReleased] = useState(true);
  const [saving, setSaving] = useState(false);

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [newSecName, setNewSecName] = useState("");
  const [newSecLimit, setNewSecLimit] = useState(0);
  const [newSecRand, setNewSecRand] = useState(true);

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [newGrpName, setNewGrpName] = useState("");
  const [newGrpSec, setNewGrpSec] = useState("");
  const [newGrpInstr, setNewGrpInstr] = useState("");
  const [newGrpBody, setNewGrpBody] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [metaRes, detailRes] = await Promise.all([
        fetch("/api/v1/portal/exams", { credentials: "include" }),
        fetch(`/api/v1/portal/exams/${examId}`, { credentials: "include" }),
      ]);
      if (detailRes.status === 401 || detailRes.status === 403) {
        router.replace("/");
        return;
      }
      const meta = metaRes.ok ? await metaRes.json() : null;
      const detail = await detailRes.json();
      if (meta?.ok) {
        setSchool(meta.school);
        setTeacherName(meta.teacher?.full_name || meta.teacher?.username || "Teacher");
      }
      if (detail.ok) {
        const ex = detail.exam;
        setName(ex.name || "");
        setExamClass(ex.exam_class || "");
        setSpecialisation(ex.specialisation || "");
        setSubjectTag(ex.subject_tag || "General");
        setDuration(Number(ex.duration || 45));
        setCalculatorType(ex.calculator_type || "none");
        setActive(Boolean(ex.active));
        setResultsReleased(Boolean(ex.results_released));
        setClasses(detail.classes || []);
        setSections(detail.sections || []);
        setGroups(detail.groups || []);
      }
    } finally {
      setLoading(false);
    }
  }, [examId, router]);

  useEffect(() => {
    if (examId) void loadAll();
  }, [examId, loadAll]);

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/portal/exams/${examId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          exam_class: examClass,
          specialisation,
          subject_tag: subjectTag,
          duration: Number(duration || 45),
          calculator_type: calculatorType,
          active,
          results_released: resultsReleased,
        }),
      });
      const json = await res.json();
      if (json.ok) showCtToast("Exam settings saved.", "ok");
      else showCtToast(json.message || "Save failed.", "bad");
    } finally {
      setSaving(false);
    }
  };

  const addSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSecName.trim()) return;
    const res = await fetch(`/api/v1/portal/exams/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "add_section",
        section_name: newSecName.trim(),
        questions_to_show: Number(newSecLimit || 0),
        randomize: newSecRand,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast(json.message || "Section added.", "ok");
      setNewSecName("");
      setNewSecLimit(0);
      await loadAll();
    } else showCtToast(json.message || "Could not add section.", "bad");
  };

  const deleteSection = async (secId: number) => {
    if (!window.confirm("Delete this section and its assigned questions?")) return;
    const res = await fetch(`/api/v1/portal/exams/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "delete_section", section_local_id: secId }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast("Section removed.", "ok");
      await loadAll();
    }
  };

  const addGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGrpName.trim() || !newGrpBody.trim()) {
      showCtToast("Enter a passage title and content.", "bad");
      return;
    }
    const res = await fetch(`/api/v1/portal/exams/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        action: "add_group",
        group_name: newGrpName.trim(),
        section_local_id: newGrpSec ? Number(newGrpSec) : null,
        instruction_text: newGrpInstr.trim(),
        group_content: newGrpBody.trim(),
      }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast("Reading passage group created.", "ok");
      setNewGrpName("");
      setNewGrpInstr("");
      setNewGrpBody("");
      await loadAll();
    }
  };

  const deleteGroup = async (gid: number) => {
    const res = await fetch(`/api/v1/portal/exams/${examId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "delete_group", group_local_id: gid }),
    });
    const json = await res.json();
    if (json.ok) {
      showCtToast("Passage group deleted.", "ok");
      await loadAll();
    }
  };

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="control" crumb={`Settings · ${name || "Exam"}`} school={school} username={teacherName}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Paper Configuration &amp; Structure</span>
            <h1>{name || "Exam Settings"}</h1>
            <p>Edit core exam rules, organize multi-section randomization, and attach shared reading passages.</p>
          </div>
          <div className="tc-head__actions">
            <Link href={`/teacher/exam/${examId}/questions`} className="tc-btn tc-btn--primary">
              <CtIco name="i-plus" className="ct-ico--sm" />
              Manage Questions
            </Link>
            <Link href="/teacher/exams-management" className="tc-btn tc-btn--secondary">
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              Control Center
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Loading exam settings...
          </div>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            {/* Core Settings Card */}
            <section className="tc-card">
              <div className="tc-card__head">
                <div className="tc-card__title">
                  <h2>General Settings &amp; Release Policy</h2>
                  <p>Changes apply immediately to new and active sittings</p>
                </div>
              </div>
              <div className="tc-card__body">
                <form onSubmit={saveSettings} className="tc-form-grid">
                  <div className="tc-form-row2">
                    <div className="tc-field">
                      <label className="tc-label">Exam Title</label>
                      <input className="tc-input" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="tc-field">
                      <label className="tc-label">Target Class</label>
                      <select className="tc-select" value={examClass} onChange={(e) => setExamClass(e.target.value)}>
                        {classes.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="tc-form-row2">
                    <div className="tc-field">
                      <label className="tc-label">Subject Tag</label>
                      <input className="tc-input" value={subjectTag} onChange={(e) => setSubjectTag(e.target.value)} />
                    </div>
                    <div className="tc-field">
                      <label className="tc-label">Specialisation</label>
                      <input
                        className="tc-input"
                        value={specialisation}
                        onChange={(e) => setSpecialisation(e.target.value)}
                        placeholder="Leave blank for all streams"
                      />
                    </div>
                  </div>
                  <div className="tc-form-row2">
                    <div className="tc-field">
                      <label className="tc-label">Duration (minutes)</label>
                      <input
                        type="number"
                        className="tc-input tc-mono"
                        min={1}
                        max={360}
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                      />
                    </div>
                    <div className="tc-field">
                      <label className="tc-label">Calculator Tool</label>
                      <select className="tc-select" value={calculatorType} onChange={(e) => setCalculatorType(e.target.value)}>
                        <option value="none">Disabled</option>
                        <option value="basic">Simple Calculator</option>
                        <option value="scientific">Scientific Calculator</option>
                      </select>
                    </div>
                  </div>
                  <div className="tc-form-row2">
                    <label className="tc-switch">
                      <span className="tc-switch__txt">
                        <strong>Exam Active</strong>
                        <span>Visible to assigned students on their portal</span>
                      </span>
                      <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    </label>
                    <label className="tc-switch">
                      <span className="tc-switch__txt">
                        <strong>Release Results Immediately</strong>
                        <span>Students see their score right after submitting</span>
                      </span>
                      <input type="checkbox" checked={resultsReleased} onChange={(e) => setResultsReleased(e.target.checked)} />
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="submit" className="tc-btn tc-btn--primary" disabled={saving}>
                      <CtIco name="i-save" className="ct-ico--sm" />
                      {saving ? "Saving..." : "Save Settings"}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            {/* Sections & Question Groups Grid */}
            <div className="tc-form-row2" style={{ alignItems: "start" }}>
              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Exam Sections ({sections.length})</h2>
                    <p>Split paper into sections with optional randomization and question caps</p>
                  </div>
                </div>
                <div className="tc-card__body" style={{ display: "grid", gap: 14 }}>
                  <form onSubmit={addSection} style={{ display: "grid", gap: 10 }}>
                    <input
                      className="tc-input"
                      placeholder="Section name (e.g., Section A: Comprehension)"
                      value={newSecName}
                      onChange={(e) => setNewSecName(e.target.value)}
                      required
                    />
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        type="number"
                        min={0}
                        className="tc-input tc-mono"
                        style={{ width: 130 }}
                        value={newSecLimit}
                        onChange={(e) => setNewSecLimit(Number(e.target.value))}
                        placeholder="0 = show all"
                        title="Questions to show (0 = all)"
                      />
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={newSecRand} onChange={(e) => setNewSecRand(e.target.checked)} />
                        Randomize
                      </label>
                      <button type="submit" className="tc-btn tc-btn--primary tc-btn--sm" style={{ marginLeft: "auto" }}>
                        <CtIco name="i-plus" className="ct-ico--xs" />
                        Add Section
                      </button>
                    </div>
                  </form>

                  {sections.map((s) => (
                    <div
                      key={s.local_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--tc-line)",
                        background: "var(--tc-surface-2)",
                      }}
                    >
                      <div>
                        <strong style={{ display: "block", fontSize: 13.5 }}>{s.section_name}</strong>
                        <span style={{ fontSize: 12, color: "var(--tc-ink-3)" }}>
                          {s.questions_to_show > 0 ? `Show ${s.questions_to_show} Qs` : "Show all Qs"} ·{" "}
                          {s.randomize ? "Randomized" : "Fixed order"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="tc-btn tc-btn--ghost tc-btn--icon"
                        style={{ color: "var(--tc-bad)" }}
                        onClick={() => void deleteSection(s.local_id)}
                      >
                        <CtIco name="i-trash" className="ct-ico--sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="tc-card">
                <div className="tc-card__head">
                  <div className="tc-card__title">
                    <h2>Reading Passage Groups ({groups.length})</h2>
                    <p>Attach shared comprehension passages or instructions to questions</p>
                  </div>
                </div>
                <div className="tc-card__body" style={{ display: "grid", gap: 14 }}>
                  <form onSubmit={addGroup} style={{ display: "grid", gap: 10 }}>
                    <input
                      className="tc-input"
                      placeholder="Passage title (e.g., Passage I: The Solar System)"
                      value={newGrpName}
                      onChange={(e) => setNewGrpName(e.target.value)}
                      required
                    />
                    {sections.length > 0 && (
                      <select className="tc-select" value={newGrpSec} onChange={(e) => setNewGrpSec(e.target.value)}>
                        <option value="">Attach to any section</option>
                        {sections.map((s) => (
                          <option key={s.local_id} value={String(s.local_id)}>
                            {s.section_name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      className="tc-input"
                      placeholder="Short instruction (optional)"
                      value={newGrpInstr}
                      onChange={(e) => setNewGrpInstr(e.target.value)}
                    />
                    <textarea
                      rows={3}
                      className="tc-input"
                      style={{ paddingTop: 10, minHeight: 80 }}
                      placeholder="Paste full reading passage here..."
                      value={newGrpBody}
                      onChange={(e) => setNewGrpBody(e.target.value)}
                      required
                    />
                    <button type="submit" className="tc-btn tc-btn--primary tc-btn--sm" style={{ justifySelf: "end" }}>
                      <CtIco name="i-plus" className="ct-ico--xs" />
                      Add Passage Group
                    </button>
                  </form>

                  {groups.map((g) => (
                    <div
                      key={g.local_id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--tc-line)",
                        background: "var(--tc-surface-2)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: 13.5 }}>{g.group_name}</strong>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--tc-ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.group_content}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="tc-btn tc-btn--ghost tc-btn--icon"
                        style={{ color: "var(--tc-bad)" }}
                        onClick={() => void deleteGroup(g.local_id)}
                      >
                        <CtIco name="i-trash" className="ct-ico--sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </TeacherShell>
    </div>
  );
}
