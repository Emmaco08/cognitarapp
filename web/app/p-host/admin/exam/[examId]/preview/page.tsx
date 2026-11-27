"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { MathText } from "@/components/portal/MathText";
import { AdminShell, OfflineSchoolMeta } from "@/components/portal/OfflineShell";

export default function AdminExamPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params?.examId || 0);

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [data, setData] = useState<any>(null);
  const [showKey, setShowKey] = useState(true);
  const [secFilter, setSecFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch(`/api/v1/portal/exams/${examId}`, { credentials: "include" }),
    ])
      .then(async ([cRes, eRes]) => {
        if (eRes.status === 401 || eRes.status === 403) {
          router.replace("/");
          return;
        }
        const c = cRes.ok ? await cRes.json() : null;
        const e = await eRes.json();
        if (!alive) return;
        if (c?.ok) setSchool(c.school);
        if (e?.ok) setData(e);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [examId, router]);

  const exam = data?.exam;
  const sections = data?.sections || [];
  const questions = (data?.questions || []).filter((q: any) =>
    secFilter === "all" ? true : String(q.section_local_id || "") === secFilter
  );

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="control" crumb={`Preview · ${exam?.name || "Paper"}`} school={school}>
        <div className={`ep-wrap${showKey ? " show-answer-key" : ""}`}>
          <header className="tc-head">
            <div className="tc-head__txt">
              <span className="tc-eyebrow">Official Paper Inspection · {exam?.exam_class || ""}</span>
              <h1>{exam?.name || "Exam Preview"}</h1>
              <p>
                Duration: {exam?.duration || 0} minutes · {(data?.questions || []).length} total items · Author:{" "}
                {exam?.teacher_name || "Administrator"}
              </p>
            </div>
            <div className="tc-head__actions">
              <button
                type="button"
                className={`tc-btn ${showKey ? "tc-btn--primary" : "tc-btn--secondary"}`}
                onClick={() => setShowKey((v) => !v)}
              >
                <CtIco name="i-check-circle" className="ct-ico--sm" />
                {showKey ? "Hide Answer Key" : "Show Answer Key"}
              </button>
              <button type="button" className="tc-btn tc-btn--secondary" onClick={() => window.print()}>
                <CtIco name="i-print" className="ct-ico--sm" />
                Print Paper
              </button>
              <Link href="/admin/exams-management" className="tc-btn tc-btn--secondary">
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                Back
              </Link>
            </div>
          </header>

          {sections.length > 0 && (
            <div className="td-class-pills" style={{ borderRadius: 12, marginBottom: 16 }}>
              <button
                type="button"
                className={`td-pill-tab${secFilter === "all" ? " is-active" : ""}`}
                onClick={() => setSecFilter("all")}
              >
                All Sections ({(data?.questions || []).length})
              </button>
              {sections.map((s: any) => (
                <button
                  key={s.local_id}
                  type="button"
                  className={`td-pill-tab${secFilter === String(s.local_id) ? " is-active" : ""}`}
                  onClick={() => setSecFilter(String(s.local_id))}
                >
                  {s.section_name}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
              Loading paper preview...
            </div>
          ) : questions.length === 0 ? (
            <section className="tc-card">
              <div className="tc-empty">
                <strong>No questions in this examination yet</strong>
              </div>
            </section>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {questions.map((q: any, idx: number) => {
                const opts = [q.option1, q.option2, q.option3, q.option4].filter(Boolean);
                return (
                  <article key={q.local_id} className="ep-q">
                    <div className="ep-q__head">
                      <span className="ep-q__num">Question {idx + 1}</span>
                      {q.mandatory && <span className="tc-pill tc-pill--warn">Mandatory</span>}
                    </div>
                    <div className="ep-q__stem">
                      <MathText text={q.question} />
                    </div>
                    <div className="ep-opts">
                      {opts.map((o: string, oi: number) => {
                        const isCorrect = o.trim() === String(q.answer || "").trim();
                        return (
                          <div key={oi} className={`ep-opt${isCorrect ? " is-correct" : ""}`}>
                            <span className="ep-opt__letter">{String.fromCharCode(65 + oi)}</span>
                            <span className="ep-opt__body">
                              <MathText text={o} />
                            </span>
                            {isCorrect && (
                              <span className="ep-opt__check" style={{ display: "none", marginLeft: "auto" }}>
                                <CtIco name="i-check" className="ct-ico--xs" />
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </AdminShell>
    </div>
  );
}
