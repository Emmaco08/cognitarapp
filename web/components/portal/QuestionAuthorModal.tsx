"use client";

import React, { useEffect, useState } from "react";
import { MathText } from "@/components/portal/MathText";

interface QuestionRow {
  local_id: number;
  question: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  answer: string;
  explanation: string;
}

const FORMULA_CHIPS = [
  { label: "a/b", snippet: "$\\frac{a}{b}$" },
  { label: "√x", snippet: "$\\sqrt{x}$" },
  { label: "x²", snippet: "$x^{2}$" },
  { label: "x₁", snippet: "$x_{1}$" },
  { label: "∑", snippet: "$\\sum_{i=1}^{n}$" },
  { label: "∫", snippet: "$\\int_{a}^{b} x\\,dx$" },
  { label: "H₂O", snippet: "$\\ce{H2O}$" },
  { label: "Rxn", snippet: "$\\ce{2H2 + O2 -> 2H2O}$" },
  { label: "θ", snippet: "$\\theta$" },
  { label: "π", snippet: "$\\pi$" },
  { label: "±", snippet: "$\\pm$" },
  { label: "≤", snippet: "$\\leq$" },
];

function parseCsvLines(text: string): Array<Record<string, string>> {
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
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((v) => v.length > 0)) rows.push(row);
  }
  if (!rows.length) return [];

  // Skip header if first row starts with "question"
  const start = rows[0][0]?.toLowerCase().includes("question") ? 1 : 0;
  const out: Array<Record<string, string>> = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] || !r[1] || !r[2]) continue;
    out.push({
      question: r[0] || "",
      option1: r[1] || "",
      option2: r[2] || "",
      option3: r[3] || "",
      option4: r[4] || "",
      answer: r[5] || r[1] || "",
      explanation: r[6] || "",
    });
  }
  return out;
}

export function QuestionAuthorModal({
  examId,
  examName,
  onClose,
  onChanged,
}: {
  examId: number;
  examName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"list" | "add" | "csv">("list");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Single question form (also used for editing)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [qText, setQText] = useState("");
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");
  const [correctLetter, setCorrectLetter] = useState<"A" | "B" | "C" | "D">("A");
  const [explanation, setExplanation] = useState("");

  // Bulk CSV paste
  const [csvText, setCsvText] = useState("");

  async function loadQuestions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/portal/exams/${examId}/questions`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  function resetForm() {
    setEditingId(null);
    setQText("");
    setOptA("");
    setOptB("");
    setOptC("");
    setOptD("");
    setCorrectLetter("A");
    setExplanation("");
  }

  function startEdit(q: QuestionRow) {
    setEditingId(q.local_id);
    setQText(q.question);
    setOptA(q.option1);
    setOptB(q.option2);
    setOptC(q.option3);
    setOptD(q.option4);
    const ans = q.answer.trim();
    if (ans === q.option2.trim() || ans.toUpperCase() === "B") setCorrectLetter("B");
    else if (ans === q.option3.trim() || ans.toUpperCase() === "C") setCorrectLetter("C");
    else if (ans === q.option4.trim() || ans.toUpperCase() === "D") setCorrectLetter("D");
    else setCorrectLetter("A");
    setExplanation(q.explanation || "");
    setMode("add");
    setMsg("");
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const payload = {
        local_id: editingId ?? undefined,
        question: qText,
        option1: optA,
        option2: optB,
        option3: optC,
        option4: optD,
        answer: correctLetter,
        explanation,
      };
      const res = await fetch(`/api/v1/portal/exams/${examId}/questions`, {
        method: editingId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg(data.message || "Could not save question.");
      } else {
        setMsg(data.message || "Saved.");
        resetForm();
        await loadQuestions();
        onChanged();
        setMode("list");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCsvImport(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseCsvLines(csvText);
    if (!parsed.length) {
      setMsg("Paste CSV rows with: question, option1, option2, option3, option4, answer");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/v1/portal/exams/${examId}/questions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg(data.message || "Could not import CSV questions.");
      } else {
        setMsg(data.message || `Imported ${parsed.length} questions.`);
        setCsvText("");
        await loadQuestions();
        onChanged();
        setMode("list");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(localId: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/portal/exams/${examId}/questions?local_id=${localId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        await loadQuestions();
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Questions for ${examName}`}>
      <div
        className="pt-modal pt-modal--wide"
        style={{ maxWidth: 760, maxHeight: "90vh", overflowY: "auto", padding: 24 }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>{examName}</h2>
            <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)" }}>
              {questions.length} question{questions.length === 1 ? "" : "s"} · Supports LaTeX math & chemistry
            </div>
          </div>
          <button type="button" className="pt-btn pt-btn--sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="pt-tabs" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={`pt-tab ${mode === "list" ? "is-active" : ""}`}
            onClick={() => {
              setMode("list");
              setMsg("");
            }}
          >
            Questions ({questions.length})
          </button>
          <button
            type="button"
            className={`pt-tab ${mode === "add" ? "is-active" : ""}`}
            onClick={() => {
              if (mode !== "add") resetForm();
              setMode("add");
              setMsg("");
            }}
          >
            {editingId ? "Edit Question" : "+ Add Question"}
          </button>
          <button
            type="button"
            className={`pt-tab ${mode === "csv" ? "is-active" : ""}`}
            onClick={() => {
              setMode("csv");
              setMsg("");
            }}
          >
            Bulk CSV Import
          </button>
        </div>

        {msg ? (
          <div className="pt-alert" style={{ marginBottom: 14 }}>
            {msg}
          </div>
        ) : null}

        {mode === "list" ? (
          loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--pt-ink-2)" }}>Loading questions...</div>
          ) : questions.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--pt-ink-2)" }}>
              No questions added yet. Add your first question or import from CSV.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {questions.map((q, idx) => (
                <div
                  key={q.local_id}
                  style={{
                    border: "1px solid var(--pt-line)",
                    borderRadius: 12,
                    padding: 14,
                    background: "var(--pt-surface-subtle)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                      <span className="pt-pill pt-pill--dark" style={{ marginRight: 8 }}>
                        Q{idx + 1}
                      </span>
                      <MathText text={q.question} />
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button type="button" className="pt-btn pt-btn--sm" onClick={() => startEdit(q)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="pt-btn pt-btn--ghost pt-btn--sm"
                        disabled={busy}
                        onClick={() => void handleDelete(q.local_id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 10, fontSize: 13 }}>
                    {[q.option1, q.option2, q.option3, q.option4].map((opt, oi) => {
                      if (!opt) return null;
                      const isAns = opt.trim() === q.answer.trim();
                      return (
                        <div
                          key={oi}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: isAns ? "1.5px solid var(--pt-obsidian)" : "1px solid var(--pt-line)",
                            background: isAns ? "var(--pt-obsidian)" : "var(--pt-surface)",
                            color: isAns ? "var(--pt-obsidian-text)" : "var(--pt-ink)",
                          }}
                        >
                          <strong>{["A", "B", "C", "D"][oi]}.</strong> <MathText text={opt} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : mode === "add" ? (
          <form className="pt-form" onSubmit={handleSaveQuestion}>
            <div className="pt-field">
              <label htmlFor="qTextArea">Question Text (Formula Chips Insert LaTeX)</label>
              <div className="pt-formula-bar">
                {FORMULA_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    className="pt-formula-chip"
                    onClick={() => setQText((prev) => (prev ? `${prev} ${chip.snippet}` : chip.snippet))}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <textarea
                id="qTextArea"
                className="pt-textarea"
                required
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder="e.g. Solve for x when $\frac{x + 4}{2} = 7$"
              />
            </div>

            {qText.trim() ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px dashed var(--pt-line-strong)",
                  background: "var(--pt-surface-subtle)",
                  fontSize: 14.5,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--pt-ink-3)", marginBottom: 4 }}>
                  Live Student Preview
                </div>
                <MathText text={qText} />
              </div>
            ) : null}

            <div className="pt-form-grid-2">
              <div className="pt-field">
                <label htmlFor="optA">Option A</label>
                <input id="optA" className="pt-input" required value={optA} onChange={(e) => setOptA(e.target.value)} />
              </div>
              <div className="pt-field">
                <label htmlFor="optB">Option B</label>
                <input id="optB" className="pt-input" required value={optB} onChange={(e) => setOptB(e.target.value)} />
              </div>
              <div className="pt-field">
                <label htmlFor="optC">Option C</label>
                <input id="optC" className="pt-input" value={optC} onChange={(e) => setOptC(e.target.value)} />
              </div>
              <div className="pt-field">
                <label htmlFor="optD">Option D</label>
                <input id="optD" className="pt-input" value={optD} onChange={(e) => setOptD(e.target.value)} />
              </div>
            </div>

            <div className="pt-form-grid-2">
              <div className="pt-field">
                <label htmlFor="correctOpt">Correct Answer</label>
                <select
                  id="correctOpt"
                  className="pt-select"
                  value={correctLetter}
                  onChange={(e) => setCorrectLetter(e.target.value as "A" | "B" | "C" | "D")}
                >
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </div>
              <div className="pt-field">
                <label htmlFor="qExpl">Explanation (optional)</label>
                <input
                  id="qExpl"
                  className="pt-input"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Optional worked step"
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="pt-btn"
                onClick={() => {
                  resetForm();
                  setMode("list");
                }}
              >
                Cancel
              </button>
              <button type="submit" className="pt-btn pt-btn--primary" disabled={busy}>
                {busy ? "Saving..." : editingId ? "Update Question" : "Save Question"}
              </button>
            </div>
          </form>
        ) : (
          <form className="pt-form" onSubmit={handleCsvImport}>
            <div className="pt-field">
              <label htmlFor="csvPaste">
                Paste CSV rows (question, optionA, optionB, optionC, optionD, answer)
              </label>
              <textarea
                id="csvPaste"
                className="pt-textarea"
                style={{ minHeight: 160, fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={'question,option1,option2,option3,option4,answer\n"What is $2^3 + 4$?",10,12,14,16,B'}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="submit" className="pt-btn pt-btn--primary" disabled={busy || !csvText.trim()}>
                {busy ? "Importing..." : "Import Questions"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
