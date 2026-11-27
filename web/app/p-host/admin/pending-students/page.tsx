"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

export default function AdminPendingStudentsPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [cRes, rRes] = await Promise.all([
        fetch("/api/v1/portal/control", { credentials: "include" }),
        fetch("/api/v1/portal/roster", { credentials: "include" }),
      ]);
      if (rRes.status === 401 || rRes.status === 403) {
        router.replace("/");
        return;
      }
      const c = cRes.ok ? await cRes.json() : null;
      const r = await rRes.json();
      if (c?.ok) setSchool(c.school);
      if (r?.ok) {
        setPending((r.students || []).filter((s: any) => s.status === "pending"));
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const approveOne = async (st: any) => {
    const res = await fetch("/api/v1/portal/roster", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ kind: "student", local_id: st.local_id, status: "approved" }),
    });
    const json = await res.json();
    if (json.ok) {
      setPending((p) => p.filter((x) => x.local_id !== st.local_id));
      showCtToast(`Approved ${st.full_name}.`, "ok");
    }
  };

  const rejectOne = async (st: any) => {
    if (!window.confirm(`Reject and remove registration for ${st.full_name}?`)) return;
    const res = await fetch(`/api/v1/portal/roster?kind=student&local_id=${st.local_id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (json.ok) {
      setPending((p) => p.filter((x) => x.local_id !== st.local_id));
      showCtToast(`Rejected ${st.full_name}.`, "ok");
    }
  };

  const approveAll = async () => {
    if (!pending.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "approve_all_pending" }),
      });
      const json = await res.json();
      if (json.ok) {
        showCtToast(json.message || "All pending students approved.", "ok");
        setPending([]);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="approvals" crumb="Pending Approvals" school={school} counts={{ pending_count: pending.length }}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Student Self-Registration Queue</span>
            <h1>Pending Student Approvals</h1>
            <p>Review newly registered student accounts before granting access to scheduled examinations.</p>
          </div>
          <div className="tc-head__actions">
            {pending.length > 0 && (
              <button type="button" className="tc-btn tc-btn--primary" disabled={busy} onClick={() => void approveAll()}>
                <CtIco name="i-check-circle" className="ct-ico--sm" />
                Approve All ({pending.length})
              </button>
            )}
            <Link href="/admin#sec-students" className="tc-btn tc-btn--secondary">
              <CtIco name="i-arrow-left" className="ct-ico--sm" />
              Students Directory
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Loading pending approvals...
          </div>
        ) : pending.length === 0 ? (
          <section className="tc-card">
            <div className="tc-empty">
              <span className="tc-empty__ico"><CtIco name="i-check-circle" /></span>
              <strong>All caught up</strong>
              <p>There are no pending student registrations awaiting approval right now.</p>
            </div>
          </section>
        ) : (
          <div className="pa-grid">
            {pending.map((st) => (
              <article key={st.local_id} className="pa-card">
                <div className="pa-card__top">
                  <div>
                    <strong style={{ display: "block", fontSize: 15 }}>{st.full_name || st.username}</strong>
                    <span className="tc-mono" style={{ fontSize: 12, color: "var(--tc-ink-3)" }}>
                      @{st.username}
                    </span>
                  </div>
                  <span className="tc-pill tc-pill--warn">Pending</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="tc-pill">{st.student_class || "General"}</span>
                  {st.specialisation && <span className="tc-pill">{st.specialisation}</span>}
                  {st.email && <span className="tc-pill">{st.email}</span>}
                </div>
                <div className="pa-card__foot">
                  <button
                    type="button"
                    className="tc-btn tc-btn--danger-soft tc-btn--sm"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => void rejectOne(st)}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="tc-btn tc-btn--primary tc-btn--sm"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => void approveOne(st)}
                  >
                    <CtIco name="i-check" className="ct-ico--xs" />
                    Approve
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminShell>
    </div>
  );
}
