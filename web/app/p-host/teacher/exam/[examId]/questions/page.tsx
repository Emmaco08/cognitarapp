"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { MathText } from "@/components/portal/MathText";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";

interface QuestionRow {
  local_id: number;
  section_local_id: number | null;
  group_local_id: number | null;
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  answer: string;
  explanation?: string;
  mandatory?: boolean;
}

interface SectionRow {
  local_id: number;
  section_name: string;
}

interface GroupRow {
  local_id: number;
  group_name: string;
}

const MATH_CHIPS = [
  { label: "a/b", insert: "$\\frac{a}{b}$" },
  { label: "√x", insert: "$\\sqrt{x}$" },
  { label: "x²", insert: "$x^{2}$" },
  { label: "xᵢ", insert: "$x_{i}$" },
  { label: "π", insert: "$\\pi$" },
  { label: "θ", insert: "$\\theta$" },
  { label: "±", insert: "$\\pm$" },
  { label: "≤", insert: "$\\le$" },
  { label: "≥", insert: "$\\ge$" },
  { label: "≠", insert: "$\\ne$" },
  { label: "∑", insert: "$\\sum_{i=1}^{n}$" },
  { label: "∫", insert: "$\\int_{a}^{b} f(x)\\,dx$" },
  { label: "→", insert: "$\\rightarrow$" },
  { label: "H₂O", insert: "$\\ce{H2O}$" },
];

export default function TeacherExamQuestionsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.examId || 0);

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [examTitle, setExamTitle] = useState("Examination");
  const [examClass, setExamClass] = useState("");
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");
  const [answerKey, setAnswerKey] = useState<"A" | "B" | "C" | "D">("A");
  const [explanation, setExplanation] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [mandatory, setMandatory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const qInputRef = useRef<HTMLTextAreaElement | null>(null);

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
        setExamTitle(detail.exam?.name || "Examination");
        setExamClass(detail.exam?.exam_class || "");
        setSections(detail.sections || []);
        setGroups(detail.groups || []);
        setQuestions(detail.questions || []);
      }
    } finally {
      setLoading(false);
    }
  }, [examId, router]);

  useEffect(() => {
    if (examId) void loadAll();
  }, [examId, loadAll]);

  const resetForm = () => {
    setEditingId(null);
    setQuestionText("");
    setOptA("");
    setOptB("");
    setOptC("");
    setOptD("");
    setAnswerKey("A");
    setExplanation("");
    setSectionId("");
    setGroupId("");
    setMandatory(false);
  };

  const insertFormula = (snippet: string) => {
    const el = qInputRef.current;
    if (!el) {
      setQuestionText((p) => p + snippet);
      return;
    }
    const start = el.selectionStart ?? questionText.length;
    const end = el.selectionEnd ?? questionText.length;
    const next = questionText.slice(0, start) + snippet + questionText.slice(end);
    setQuestionText(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 10);
  };

  const startEdit = (q: QuestionRow) => {
    setEditingId(q.local_id);
    setQuestionText(q.question);
    setOptA(q.option1);
    setOptB(q.option2);
    setOptC(q.option3);
    setOptD(q.option4);
    const ans = (q.answer || "").trim();
    if (ans === (q.option2 || "").trim()) setAnswerKey("B");
    else if (ans === (q.option3 || "").trim()) setAnswerKey("C");
    else if (ans === (q.option4 || "").trim()) setAnswerKey("D");
    else setAnswerKey("A");
    setExplanation(q.explanation || "");
    setSectionId(q.section_local_id ? String(q.section_local_id) : "");
    setGroupId(q.group_local_id ? String(q.group_local_id) : "");
    setMandatory(Boolean(q.mandatory));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || !optA.trim() || !optB.trim()) {
      showCtToast("Enter the question stem and at least Option A and Option B.", "bad");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        local_id: editingId || undefined,
        question: questionText.trim(),
        option1: optA.trim(),
        option2: optB.trim(),
        option3: optC.trim(),
        option4: optD.trim(),
        answer: answerKey,
        explanation: explanation.trim(),
        section_local_id: sectionId ? Number(sectionId) : null,
        group_local_id: groupId ? Number(groupId) : null,
        mandatory,
      };
      const res = await fetch(`/api/v1/portal/exams/${examId}/questions`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not save question.", "bad");
        return;
      }
      showCtToast(editingId ? "Question updated." : "Question added to bank.", "ok");
      resetForm();
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (qLocalId: number) => {
    if (!window.confirm("Remove this question from the exam?")) return;
    const res = await fetch(`/api/v1/portal/exams/${examId}/questions?local_id=${qLocalId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (json.ok) {
      setQuestions((prev) => prev.filter((q) => q.local_id !== qLocalId));
      showCtToast("Question removed.", "ok");
    }
  };

  const filteredQs = questions.filter((q) =>
    !searchQ.trim() ? true : q.question.toLowerCase().includes(searchQ.trim().toLowerCase())
  );

  const secMap = new Map(sections.map((s) => [s.local_id, s.section_name]));

  return (
    <div className="ct-app tc-studio">
      <TeacherShell
        active="control"
        crumb={`Questions · ${examTitle}`}
        school={school}
        username={teacherName}
      >
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Question Bank &amp; Formula Studio · {examClass}</span>
            <h1>{examTitle}</h1>
            <p>Author multiple-choice items with LaTeX math/chemistry rendering, assign sections, and preview exactly what students see.</p>
          </div>
          <div className="tc-head__actions">
            <Link href={`/teacher/exam/${examId}/settings`} className="tc-btn tc-btn--secondary">
              <CtIco name="i-settings" className="ct-ico--sm" />
              Settings &amp; Sections
            </Link>
            <Link href={`/teacher/exam/${examId}/analytics`} className="tc-btn tc-btn--secondary">
              <CtIco name="i-chart" className="ct-ico--sm" />
              Analytics
            </Link>
            <Link href="/teacher/exams-management" className="tc-btn tc-btn--secondary">
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              Control Center
            </Link>
          </div>
        </header>

        <div className="qb-layout">
          {/* Left: Author / Edit Question + Formula Studio */}
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>{editingId ? `Edit Question #${editingId}` : "Add New Question"}</h2>
                <p>Use $...$ for inline LaTeX math or click any formula chip below</p>
              </div>
              {editingId && (
                <button type="button" className="tc-btn tc-btn--ghost tc-btn--sm" onClick={resetForm}>
                  Cancel Edit
                </button>
              )}
            </div>
            <div className="tc-card__body">
              <form onSubmit={handleSave} className="tc-form-grid">
                {(sections.length > 0 || groups.length > 0) && (
                  <div className="tc-form-row2">
                    <div className="tc-field">
                      <label className="tc-label">Section (optional)</label>
                      <select className="tc-select" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                        <option value="">Default / General</option>
                        {sections.map((s) => (
                          <option key={s.local_id} value={String(s.local_id)}>
                            {s.section_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="tc-field">
                      <label className="tc-label">Reading Passage Group</label>
                      <select className="tc-select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                        <option value="">None</option>
                        {groups.map((g) => (
                          <option key={g.local_id} value={String(g.local_id)}>
                            {g.group_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="tc-field">
                  <label className="tc-label">Question Text</label>
                  <div className="qb-math-bar">
                    {MATH_CHIPS.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        className="qb-math-chip"
                        onClick={() => insertFormula(c.insert)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={qInputRef}
                    rows={4}
                    className="tc-input"
                    style={{ borderRadius: "0 0 10px 10px", paddingTop: 10, minHeight: 96 }}
                    placeholder="Type question stem... e.g., Find the roots of $x^2 - 5x + 6 = 0$"
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    required
                  />
                </div>

                {questionText.trim() && (
                  <div className="qb-preview-box">
                    <div style={{ fontSize: 10.5, fontFamily: "var(--ct-mono)", color: "var(--ct-ink-3)", textTransform: "uppercase", marginBottom: 4 }}>
                      Live Student Preview
                    </div>
                    <MathText text={questionText} />
                  </div>
                )}

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">Option A</label>
                    <input className="tc-input" value={optA} onChange={(e) => setOptA(e.target.value)} required placeholder="First option" />
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">Option B</label>
                    <input className="tc-input" value={optB} onChange={(e) => setOptB(e.target.value)} required placeholder="Second option" />
                  </div>
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">Option C</label>
                    <input className="tc-input" value={optC} onChange={(e) => setOptC(e.target.value)} placeholder="Third option" />
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">Option D</label>
                    <input className="tc-input" value={optD} onChange={(e) => setOptD(e.target.value)} placeholder="Fourth option" />
                  </div>
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">Correct Answer</label>
                    <select
                      className="tc-select"
                      value={answerKey}
                      onChange={(e) => setAnswerKey(e.target.value as "A" | "B" | "C" | "D")}
                    >
                      <option value="A">Option A</option>
                      <option value="B">Option B</option>
                      <option value="C">Option C</option>
                      <option value="D">Option D</option>
                    </select>
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">Mandatory Item</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, height: 40, fontSize: 13 }}>
                      <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
                      <span>Always include when randomizing</span>
                    </label>
                  </div>
                </div>

                <div className="tc-field">
                  <label className="tc-label">Explanation (optional)</label>
                  <input
                    className="tc-input"
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Shown during script review"
                  />
                </div>

                <button type="submit" className="tc-btn tc-btn--primary tc-btn--lg" disabled={saving}>
                  <CtIco name={editingId ? "i-save" : "i-plus"} className="ct-ico--sm" />
                  {saving ? "Saving..." : editingId ? "Update Question" : "Save Question to Bank"}
                </button>
              </form>
            </div>
          </section>

          {/* Right: Existing Questions Bank */}
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Question Bank ({questions.length})</h2>
                <p>Click Edit to modify any item or remove outdated questions</p>
              </div>
              <label className="tc-search" style={{ width: 200 }}>
                <CtIco name="i-search" className="ct-ico--sm" />
                <input
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Filter questions..."
                />
              </label>
            </div>
            <div className="tc-card__body" style={{ display: "grid", gap: 12 }}>
              {loading ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--tc-ink-3)" }}>Loading questions...</div>
              ) : filteredQs.length === 0 ? (
                <div className="tc-empty">
                  <span className="tc-empty__ico">
                    <CtIco name="i-doc" />
                  </span>
                  <strong>No questions yet</strong>
                  <p>Add your first question on the left to make this paper ready for students.</p>
                </div>
              ) : (
                filteredQs.map((q, idx) => {
                  const opts = [
                    { k: "A", v: q.option1 },
                    { k: "B", v: q.option2 },
                    { k: "C", v: q.option3 },
                    { k: "D", v: q.option4 },
                  ].filter((o) => o.v && o.v.trim());
                  return (
                    <div key={q.local_id} className="qb-qitem">
                      <div className="qb-qitem__head">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span className="tc-pill tc-mono">Q{idx + 1}</span>
                          {q.section_local_id && secMap.get(q.section_local_id) && (
                            <span className="tc-pill">{secMap.get(q.section_local_id)}</span>
                          )}
                          {q.mandatory && <span className="tc-pill tc-pill--warn">Mandatory</span>}
                        </div>
                        <div className="tc-actions">
                          <button type="button" className="tc-btn tc-btn--secondary tc-btn--sm" onClick={() => startEdit(q)}>
                            <CtIco name="i-edit" className="ct-ico--xs" />
                            Edit
                          </button>
                          <button
                            type="button"
                            className="tc-btn tc-btn--ghost tc-btn--icon"
                            style={{ color: "var(--tc-bad)" }}
                            onClick={() => void handleDelete(q.local_id)}
                            title="Delete question"
                          >
                            <CtIco name="i-trash" className="ct-ico--sm" />
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tc-ink)", lineHeight: 1.5 }}>
                        <MathText text={q.question} />
                      </div>
                      <div className="qb-opts-grid">
                        {opts.map((o) => {
                          const isAns = o.v.trim() === (q.answer || "").trim() || o.k === (q.answer || "").trim().toUpperCase();
                          return (
                            <div key={o.k} className={`qb-opt${isAns ? " is-ans" : ""}`}>
                              <span className="qb-opt__key">{o.k}</span>
                              <span>
                                <MathText text={o.v} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </TeacherShell>
    </div>
  );
}
