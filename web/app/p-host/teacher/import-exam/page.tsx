"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { OfflineSchoolMeta, showCtToast, TeacherShell } from "@/components/portal/OfflineShell";

interface ParsedQuestion {
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  answer: string;
  explanation?: string;
  section_name?: string;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.trim() || row.length) {
    row.push(cell.trim());
    if (row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}

export default function TeacherImportExamPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);

  const [examName, setExamName] = useState("");
  const [examClass, setExamClass] = useState("");
  const [subjectTag, setSubjectTag] = useState("General");
  const [duration, setDuration] = useState(45);
  const [calculatorType, setCalculatorType] = useState<"none" | "basic" | "scientific">("none");
  const [active, setActive] = useState(false);

  const [fileName, setFileName] = useState("");
  const [sections, setSections] = useState<Array<{ section_name: string; questions_to_show?: number; randomize?: boolean }>>([]);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [parseErr, setParseErr] = useState("");
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);

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
        if (Array.isArray(json.classes) && json.classes.length) {
          setClasses(json.classes);
          setExamClass(json.classes[0]);
        }
      })
      .catch(() => {});
  }, [router]);

  const handleFile = async (file: File) => {
    setParseErr("");
    setFileName(file.name);
    const text = await file.text();
    try {
      if (file.name.toLowerCase().endsWith(".json")) {
        const obj = JSON.parse(text);
        const rawQs: Record<string, unknown>[] = Array.isArray(obj)
          ? obj
          : Array.isArray(obj.questions)
            ? obj.questions
            : [];
        if (obj && !Array.isArray(obj)) {
          if (obj.name || obj.exam_name) setExamName(String(obj.name || obj.exam_name));
          if (obj.exam_class || obj.class) setExamClass(String(obj.exam_class || obj.class));
          if (obj.duration) setDuration(Number(obj.duration) || 45);
          if (obj.subject_tag) setSubjectTag(String(obj.subject_tag));
          if (Array.isArray(obj.sections)) setSections(obj.sections);
        }
        const parsed: ParsedQuestion[] = rawQs
          .map((q) => ({
            question: String(q.question || q.text || "").trim(),
            option1: String(q.option1 || q.a || q.A || "").trim(),
            option2: String(q.option2 || q.b || q.B || "").trim(),
            option3: String(q.option3 || q.c || q.C || "").trim(),
            option4: String(q.option4 || q.d || q.D || "").trim(),
            answer: String(q.answer || q.correct || "A").trim(),
            explanation: String(q.explanation || "").trim(),
            section_name: String(q.section_name || q.section || "").trim(),
          }))
          .filter((q) => q.question && q.option1 && q.option2);
        if (!parsed.length) throw new Error("No valid questions found in JSON file.");
        setQuestions(parsed);
      } else {
        const rows = parseCsvRows(text);
        if (rows.length < 2) throw new Error("CSV file needs a header row and at least one question.");
        const header = rows[0].map((h) => h.toLowerCase());
        const idxOf = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
        const qIdx = Math.max(0, idxOf("question"));
        const aIdx = idxOf("option1", "option a", "opt_a", "a");
        const bIdx = idxOf("option2", "option b", "opt_b", "b");
        const cIdx = idxOf("option3", "option c", "opt_c", "c");
        const dIdx = idxOf("option4", "option d", "opt_d", "d");
        const ansIdx = idxOf("answer", "correct");
        const secIdx = idxOf("section");

        const parsed: ParsedQuestion[] = rows
          .slice(1)
          .map((r) => ({
            question: r[qIdx] || "",
            option1: r[aIdx >= 0 ? aIdx : 1] || "",
            option2: r[bIdx >= 0 ? bIdx : 2] || "",
            option3: r[cIdx >= 0 ? cIdx : 3] || "",
            option4: r[dIdx >= 0 ? dIdx : 4] || "",
            answer: r[ansIdx >= 0 ? ansIdx : 5] || "A",
            section_name: secIdx >= 0 ? r[secIdx] || "" : "",
          }))
          .filter((q) => q.question && q.option1 && q.option2);

        if (!parsed.length) throw new Error("No valid question rows parsed from CSV.");
        if (!examName) setExamName(file.name.replace(/\.[^.]+$/, ""));
        const secNames = Array.from(new Set(parsed.map((p) => p.section_name).filter(Boolean))) as string[];
        setSections(secNames.map((section_name) => ({ section_name })));
        setQuestions(parsed);
      }
    } catch (e: unknown) {
      setQuestions([]);
      setParseErr(e instanceof Error ? e.message : "Could not parse uploaded file.");
    }
  };

  const downloadTemplate = (kind: "json" | "csv") => {
    const content =
      kind === "json"
        ? JSON.stringify(
            {
              name: "Sample Mathematics Assessment",
              exam_class: classes[0] || "SS 1",
              subject_tag: "Mathematics",
              duration: 45,
              sections: [{ section_name: "Section A: Algebra", randomize: true }],
              questions: [
                {
                  section_name: "Section A: Algebra",
                  question: "Solve for $x$: $2x + 6 = 14$",
                  option1: "3",
                  option2: "4",
                  option3: "5",
                  option4: "6",
                  answer: "B",
                },
              ],
            },
            null,
            2
          )
        : `question,option1,option2,option3,option4,answer,section\n"Solve for x: 2x + 6 = 14","3","4","5","6","B","Algebra"\n"What is the SI unit of Force?","Joule","Newton","Watt","Pascal","B","Physics"\n`;
    const blob = new Blob([content], { type: kind === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cognitara_exam_template.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName.trim() || !examClass) {
      showCtToast("Enter exam title and target class.", "bad");
      return;
    }
    if (!questions.length) {
      showCtToast("Upload a JSON or CSV file containing questions first.", "bad");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/v1/portal/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: examName.trim(),
          exam_class: examClass,
          subject_tag: subjectTag.trim() || "General",
          duration: Number(duration || 45),
          calculator_type: calculatorType,
          active,
          sections,
          questions,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Import failed.", "bad");
        return;
      }
      showCtToast(`Imported "${examName}" with ${json.added_questions} questions.`, "ok");
      router.push(`/teacher/exam/${json.exam.local_id}/questions`);
    } catch {
      showCtToast("Connection error during import.", "bad");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="ct-app tc-studio">
      <TeacherShell active="import" crumb="Import Exam" school={school} username={teacherName}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Bulk Assessment Import</span>
            <h1>Import Exam Package (JSON / CSV)</h1>
            <p>Upload a CogniTara JSON export or spreadsheet CSV to build an entire exam and question bank in one step.</p>
          </div>
          <div className="tc-head__actions">
            <button type="button" className="tc-btn tc-btn--secondary" onClick={() => downloadTemplate("csv")}>
              <CtIco name="i-download" className="ct-ico--sm" />
              CSV Template
            </button>
            <button type="button" className="tc-btn tc-btn--secondary" onClick={() => downloadTemplate("json")}>
              <CtIco name="i-download" className="ct-ico--sm" />
              JSON Template
            </button>
          </div>
        </header>

        <div className="tc-grid-form">
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Upload &amp; Configure</h2>
                <p>Drop your .json or .csv file, verify settings, and import</p>
              </div>
              {questions.length > 0 && <span className="tc-pill tc-pill--ok">{questions.length} questions parsed</span>}
            </div>
            <div className="tc-card__body">
              <form onSubmit={handleImport} className="tc-form-grid">
                <label
                  className={`imp-dropzone${dragging ? " is-drag" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleFile(f);
                  }}
                >
                  <input
                    type="file"
                    accept=".json,.csv"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleFile(f);
                    }}
                  />
                  <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
                    <CtIco name="i-upload" className="ct-ico--lg" />
                    <strong style={{ fontSize: 14.5 }}>
                      {fileName ? `Selected: ${fileName}` : "Click or drag a JSON / CSV exam file here"}
                    </strong>
                    <span style={{ fontSize: 12.5, color: "var(--tc-ink-3)" }}>
                      Supports CogniTara offline JSON exports and standard CSV question sheets
                    </span>
                  </div>
                </label>

                {parseErr && (
                  <div className="ed-alert" role="alert">
                    <CtIco name="i-alert" className="ct-ico--sm" />
                    <span>{parseErr}</span>
                  </div>
                )}

                <div className="tc-field">
                  <label className="tc-label">Examination Title</label>
                  <input
                    type="text"
                    className="tc-input tc-input--lg"
                    placeholder="e.g., Physics Term Assessment"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    required
                  />
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">Target Class</label>
                    <select
                      className="tc-select tc-select--lg"
                      value={examClass}
                      onChange={(e) => setExamClass(e.target.value)}
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
                    <label className="tc-label">Duration (minutes)</label>
                    <input
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
                    <label className="tc-label">Subject Tag</label>
                    <input
                      type="text"
                      className="tc-input tc-input--lg"
                      value={subjectTag}
                      onChange={(e) => setSubjectTag(e.target.value)}
                    />
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">Calculator</label>
                    <select
                      className="tc-select tc-select--lg"
                      value={calculatorType}
                      onChange={(e) => setCalculatorType(e.target.value as "none" | "basic" | "scientific")}
                    >
                      <option value="none">Disabled</option>
                      <option value="basic">Simple Calculator</option>
                      <option value="scientific">Scientific Calculator</option>
                    </select>
                  </div>
                </div>

                <label className="tc-switch">
                  <span className="tc-switch__txt">
                    <strong>Activate immediately after import</strong>
                    <span>Leave unchecked to review questions as a draft first.</span>
                  </span>
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                </label>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 6, borderTop: "1px solid var(--tc-line)" }}>
                  <Link href="/teacher" className="tc-btn tc-btn--ghost">
                    Cancel
                  </Link>
                  <button type="submit" className="tc-btn tc-btn--primary tc-btn--lg" disabled={importing || !questions.length}>
                    <CtIco name="i-upload" className="ct-ico--sm" />
                    {importing ? "Importing..." : `Import ${questions.length || ""} Questions`}
                  </button>
                </div>
              </form>
            </div>
          </section>

          <aside style={{ display: "grid", gap: 18 }}>
            <section className="tc-card">
              <div className="tc-card__head">
                <div className="tc-card__title">
                  <h3>Parsed Preview</h3>
                  <p>First 6 questions detected in your file</p>
                </div>
                <span className="tc-pill">{sections.length} sections</span>
              </div>
              <div className="tc-card__body" style={{ display: "grid", gap: 10 }}>
                {questions.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--tc-ink-3)" }}>
                    Upload a CSV or JSON file to inspect parsed questions before saving.
                  </p>
                ) : (
                  questions.slice(0, 6).map((q, idx) => (
                    <div key={idx} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--tc-line)", background: "var(--tc-surface-2)" }}>
                      <div style={{ fontSize: 11, fontFamily: "var(--ct-mono)", color: "var(--tc-ink-3)", marginBottom: 4 }}>
                        Q{idx + 1}{q.section_name ? ` · ${q.section_name}` : ""} · Ans: {q.answer}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tc-ink)" }}>{q.question}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </TeacherShell>
    </div>
  );
}
