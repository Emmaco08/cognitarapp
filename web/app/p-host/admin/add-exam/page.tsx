"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

interface DraftQuestion {
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  answer: "A" | "B" | "C" | "D";
}

const emptyQ = (): DraftQuestion => ({
  question: "",
  option1: "",
  option2: "",
  option3: "",
  option4: "",
  answer: "A",
});

export default function AdminAddExamPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);
  const [teachers, setTeachers] = useState<any[]>([]);

  const [name, setName] = useState("");
  const [examClass, setExamClass] = useState("");
  const [subjectTag, setSubjectTag] = useState("General");
  const [teacherLocalId, setTeacherLocalId] = useState("");
  const [duration, setDuration] = useState(45);
  const [calculatorType, setCalculatorType] = useState<"none" | "basic" | "scientific">("none");
  const [active, setActive] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQ()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/v1/portal/exams", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.replace("/");
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!json?.ok) return;
        setSchool(json.school);
        if (Array.isArray(json.all_classes) && json.all_classes.length) setClasses(json.all_classes);
        setTeachers(json.teachers || []);
      })
      .catch(() => {});
  }, [router]);

  const updateQ = (idx: number, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !examClass) {
      showCtToast("Enter exam title and select a target class.", "bad");
      return;
    }
    const validQs = questions.filter((q) => q.question.trim() && q.option1.trim() && q.option2.trim());
    setSaving(true);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          exam_class: examClass,
          subject_tag: subjectTag.trim() || "General",
          teacher_local_id: teacherLocalId ? Number(teacherLocalId) : null,
          duration: Number(duration || 45),
          calculator_type: calculatorType,
          active,
          questions: validQs,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not create exam.", "bad");
        return;
      }
      showCtToast(json.message || "Examination created.", "ok");
      router.push("/admin/exams-management");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="exams" crumb="Add Examination" school={school}>
        <div className="af-shell" style={{ maxWidth: 920 }}>
          <header className="tc-head">
            <div className="tc-head__txt">
              <span className="tc-eyebrow">Admin Assessment Authoring</span>
              <h1>Create New Examination</h1>
              <p>Configure exam details and author questions directly on this page.</p>
            </div>
            <div className="tc-head__actions">
              <Link href="/admin/exams-management" className="tc-btn tc-btn--secondary">
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                Back to Control Center
              </Link>
            </div>
          </header>

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
            <section className="af-card">
              <div className="af-head">
                <h2>Exam Details</h2>
                <p>Class targeting, timing, teacher owner, and calculator permissions</p>
              </div>
              <div style={{ padding: 22, display: "grid", gap: 16 }}>
                <div className="af-grid">
                  <div className="af-field af-field--full">
                    <label className="af-label">
                      <span>Examination Title<span className="af-req">*</span></span>
                    </label>
                    <input
                      className="af-input"
                      placeholder="e.g., First Term Mathematics Exam"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="af-field">
                    <label className="af-label">
                      <span>Target Class<span className="af-req">*</span></span>
                    </label>
                    <select className="af-select" value={examClass} onChange={(e) => setExamClass(e.target.value)} required>
                      <option value="">Select class...</option>
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="af-field">
                    <label className="af-label"><span>Assigned Teacher (Optional)</span></label>
                    <select className="af-select" value={teacherLocalId} onChange={(e) => setTeacherLocalId(e.target.value)}>
                      <option value="">Administrator Owned</option>
                      {teachers.map((t) => (
                        <option key={t.local_id} value={String(t.local_id)}>
                          {t.full_name || t.username}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="af-field">
                    <label className="af-label"><span>Subject Tag</span></label>
                    <input className="af-input" value={subjectTag} onChange={(e) => setSubjectTag(e.target.value)} />
                  </div>

                  <div className="af-field">
                    <label className="af-label"><span>Duration (Minutes)</span></label>
                    <input
                      type="number"
                      min={1}
                      max={360}
                      className="af-input tc-mono"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                    />
                  </div>

                  <div className="af-field">
                    <label className="af-label"><span>Calculator</span></label>
                    <select
                      className="af-select"
                      value={calculatorType}
                      onChange={(e) => setCalculatorType(e.target.value as "none" | "basic" | "scientific")}
                    >
                      <option value="none">Disabled</option>
                      <option value="basic">Simple Calculator</option>
                      <option value="scientific">Scientific Calculator</option>
                    </select>
                  </div>

                  <div className="af-field">
                    <label className="af-label"><span>Availability</span></label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, height: 42, fontSize: 13.5 }}>
                      <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                      <span>Publish as Active immediately</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* Inline Multi-Question Builder */}
            <section className="af-card">
              <div className="af-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <h2>Questions ({questions.length})</h2>
                  <p>Add multiple-choice questions now (LaTeX $...$ supported)</p>
                </div>
                <button
                  type="button"
                  className="tc-btn tc-btn--secondary tc-btn--sm"
                  onClick={() => setQuestions((p) => [...p, emptyQ()])}
                >
                  <CtIco name="i-plus" className="ct-ico--xs" />
                  Add Another Question
                </button>
              </div>
              <div style={{ padding: 22, display: "grid", gap: 16 }}>
                {questions.map((q, idx) => (
                  <div key={idx} className="qb-qitem">
                    <div className="qb-qitem__head">
                      <span className="tc-pill tc-mono">Question {idx + 1}</span>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          className="tc-btn tc-btn--ghost tc-btn--sm"
                          style={{ color: "var(--tc-bad)" }}
                          onClick={() => setQuestions((p) => p.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      className="af-input"
                      style={{ height: "auto", padding: "10px 12px" }}
                      placeholder="Enter question text..."
                      value={q.question}
                      onChange={(e) => updateQ(idx, { question: e.target.value })}
                    />
                    <div className="af-grid">
                      <input className="af-input" placeholder="Option A" value={q.option1} onChange={(e) => updateQ(idx, { option1: e.target.value })} />
                      <input className="af-input" placeholder="Option B" value={q.option2} onChange={(e) => updateQ(idx, { option2: e.target.value })} />
                      <input className="af-input" placeholder="Option C" value={q.option3} onChange={(e) => updateQ(idx, { option3: e.target.value })} />
                      <input className="af-input" placeholder="Option D" value={q.option4} onChange={(e) => updateQ(idx, { option4: e.target.value })} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 600 }}>Correct Option:</label>
                      <select
                        className="af-select"
                        style={{ width: 150, height: 34 }}
                        value={q.answer}
                        onChange={(e) => updateQ(idx, { answer: e.target.value as "A" | "B" | "C" | "D" })}
                      >
                        <option value="A">Option A</option>
                        <option value="B">Option B</option>
                        <option value="C">Option C</option>
                        <option value="D">Option D</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="af-foot">
                <Link href="/admin/exams-management" className="tc-btn tc-btn--ghost">
                  Cancel
                </Link>
                <button type="submit" className="tc-btn tc-btn--primary" disabled={saving}>
                  <CtIco name="i-check-circle" className="ct-ico--sm" />
                  {saving ? "Creating..." : "Create Examination"}
                </button>
              </div>
            </section>
          </form>
        </div>
      </AdminShell>
    </div>
  );
}
