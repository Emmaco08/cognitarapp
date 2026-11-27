"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";

export default function TeacherCreateExamPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);

  const [name, setName] = useState("");
  const [targetClass, setTargetClass] = useState("");
  const [specialisation, setSpecialisation] = useState("General");
  const [subjectTag, setSubjectTag] = useState("General");
  const [duration, setDuration] = useState(60);
  const [calculatorType, setCalculatorType] = useState<"none" | "basic" | "scientific">("none");
  const [resultPolicy, setResultPolicy] = useState<"immediate" | "withheld">("immediate");
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

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
        setTeacherName(json.teacher?.full_name || json.teacher?.username || "Teacher");
        if (Array.isArray(json.classes) && json.classes.length) setClasses(json.classes);
        if (json.school_policy?.default_result_visibility === "withheld") {
          setResultPolicy("withheld");
        }
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetClass) {
      showCtToast("Enter an exam title and select a target class.", "bad");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          exam_class: targetClass,
          specialisation: specialisation === "General" ? "" : specialisation,
          subject_tag: subjectTag.trim() || "General",
          duration: Number(duration || 60),
          calculator_type: calculatorType,
          result_release_policy: resultPolicy,
          active,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not create exam.", "bad");
        return;
      }
      showCtToast("Exam created. Add your questions next.", "ok");
      router.push(`/teacher/exam/${json.exam.local_id}/questions`);
    } catch {
      showCtToast("Connection error while creating exam.", "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="add_exam" crumb="Create Exam" school={school} username={teacherName}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Assessment Authoring</span>
            <h1>Create New Exam</h1>
            <p>Configure audience visibility, timing, and tools. You will add sections and questions right after saving.</p>
          </div>
          <div className="tc-head__actions">
            <Link href="/teacher" className="tc-btn tc-btn--secondary">
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              Back to Dashboard
            </Link>
          </div>
        </header>

        <div className="tc-grid-form">
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Exam Configuration</h2>
                <p>Core metadata, class targeting, and student tool permissions</p>
              </div>
              <span className="tc-pill">Step 1 of 3</span>
            </div>
            <div className="tc-card__body">
              <form onSubmit={handleSubmit} className="tc-form-grid">
                <div className="tc-field">
                  <label className="tc-label" htmlFor="examNameInput">Examination Title</label>
                  <input
                    id="examNameInput"
                    type="text"
                    className="tc-input tc-input--lg"
                    placeholder="e.g., Mathematics Mid-Term Assessment"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label" htmlFor="targetClass">Target Class</label>
                    <select
                      id="targetClass"
                      className="tc-select tc-select--lg"
                      value={targetClass}
                      onChange={(e) => setTargetClass(e.target.value)}
                      required
                    >
                      <option value="">Select class...</option>
                      {classes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tc-field">
                    <label className="tc-label" htmlFor="specialisationTag">Specialisation Scope</label>
                    <select
                      id="specialisationTag"
                      className="tc-select tc-select--lg"
                      value={specialisation}
                      onChange={(e) => setSpecialisation(e.target.value)}
                    >
                      <option value="General">General (All students in class)</option>
                      <option value="Science">Science</option>
                      <option value="Art">Arts / Humanities</option>
                      <option value="Commercial">Commercial / Business</option>
                    </select>
                  </div>
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label" htmlFor="subjectTagInput">Subject Tag</label>
                    <input
                      id="subjectTagInput"
                      type="text"
                      className="tc-input tc-input--lg"
                      placeholder="e.g., Mathematics, Physics, English"
                      value={subjectTag}
                      onChange={(e) => setSubjectTag(e.target.value)}
                      required
                    />
                  </div>
                  <div className="tc-field">
                    <label className="tc-label" htmlFor="durationInput">Duration (minutes)</label>
                    <input
                      id="durationInput"
                      type="number"
                      className="tc-input tc-input--lg tc-mono"
                      min={1}
                      max={360}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label" htmlFor="calculatorTypeSelect">On-Screen Calculator</label>
                    <select
                      id="calculatorTypeSelect"
                      className="tc-select tc-select--lg"
                      value={calculatorType}
                      onChange={(e) => setCalculatorType(e.target.value as "none" | "basic" | "scientific")}
                    >
                      <option value="none">Disabled (No calculator)</option>
                      <option value="basic">Simple Calculator</option>
                      <option value="scientific">Scientific Calculator</option>
                    </select>
                  </div>
                  <div className="tc-field">
                    <label className="tc-label" htmlFor="resultPolicySelect">Result Visibility</label>
                    <select
                      id="resultPolicySelect"
                      className="tc-select tc-select--lg"
                      value={resultPolicy}
                      onChange={(e) => setResultPolicy(e.target.value as "immediate" | "withheld")}
                    >
                      <option value="immediate">Immediate score on submission</option>
                      <option value="withheld">Withheld until released</option>
                    </select>
                  </div>
                </div>

                <label className="tc-switch">
                  <span className="tc-switch__txt">
                    <strong>Publish as Active Immediately</strong>
                    <span>Allow eligible students to see and begin this exam right away.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                </label>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    paddingTop: 6,
                    borderTop: "1px solid var(--tc-line)",
                  }}
                >
                  <Link href="/teacher" className="tc-btn tc-btn--ghost">
                    Cancel
                  </Link>
                  <button type="submit" className="tc-btn tc-btn--primary tc-btn--lg" disabled={busy}>
                    {busy ? "Creating..." : "Create Exam & Continue"}
                    <CtIco name="i-arrow-right" className="ct-ico--sm" />
                  </button>
                </div>
              </form>
            </div>
          </section>

          <aside style={{ display: "grid", gap: 20 }}>
            <section className="tc-card">
              <div className="tc-card__head">
                <div className="tc-card__title">
                  <h3>Audience Visibility</h3>
                  <p>Smart Override rules preview</p>
                </div>
                <span className={`tc-pill ${!targetClass ? "" : specialisation === "General" ? "tc-pill--ok" : "tc-pill--accent"}`}>
                  {!targetClass ? "Pending" : specialisation === "General" ? "General" : "Restricted"}
                </span>
              </div>
              <div className="tc-card__body" style={{ display: "grid", gap: 14 }}>
                <div className={`tc-callout${specialisation !== "General" ? " tc-callout--accent" : ""}`}>
                  <strong>
                    {!targetClass
                      ? "Select a Target Class"
                      : specialisation === "General"
                        ? `Visible to All ${targetClass} Students`
                        : `Restricted to ${specialisation} Stream`}
                  </strong>
                  <p>
                    {!targetClass
                      ? "Choose a class to preview student visibility rules for this examination."
                      : specialisation === "General"
                        ? `Every approved student in ${targetClass} across all streams will see this exam on their portal.`
                        : `Only ${specialisation} students in ${targetClass} will be able to access this exam.`}
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "var(--tc-ink-3)" }}>
                  <strong>General</strong> papers appear for every approved student in the chosen class. Picking a department specialisation limits visibility strictly to that stream.
                </p>
              </div>
            </section>

            <section className="tc-card">
              <div className="tc-card__head">
                <div className="tc-card__title">
                  <h3>Authoring Workflow</h3>
                  <p>What happens next</p>
                </div>
              </div>
              <div className="tc-steps">
                <div className="tc-step">
                  <span className="tc-step__num">01</span>
                  <div>
                    <strong>Configure Paper</strong>
                    <span>Set class scope, subject tag, timing, and calculator availability.</span>
                  </div>
                </div>
                <div className="tc-step">
                  <span className="tc-step__num">02</span>
                  <div>
                    <strong>Add Sections &amp; Questions</strong>
                    <span>Author MCQ items, passages, LaTeX math, or import JSON/CSV banks.</span>
                  </div>
                </div>
                <div className="tc-step">
                  <span className="tc-step__num">03</span>
                  <div>
                    <strong>Monitor &amp; Analyze</strong>
                    <span>Track live attempts, grade distribution rings, and item error rates.</span>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </TeacherShell>
    </div>
  );
}
