"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CtIco } from "./CtIco";
import { showCtToast } from "./OfflineShell";

export interface LiveSessionRow {
  id: string;
  student_local_id: number;
  student_name: string;
  student_username: string;
  student_class: string;
  exam_local_id: number;
  exam_name: string;
  exam_class: string;
  teacher_name: string;
  duration: number;
  remaining_seconds: number;
  warnings_count: number;
  max_warnings: number;
  is_paused: boolean;
  resume_requested: boolean;
  resume_reason: string;
  connection: "active" | "lagging" | "disconnected";
  last_seen_seconds: number;
  answered_count: number;
  started_at: string;
}

interface SupportStats {
  total: number;
  writing: number;
  paused: number;
  resume_requests: number;
  offline: number;
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function LiveSupportConsole({ role }: { role: "admin" | "teacher" }) {
  const [sessions, setSessions] = useState<LiveSessionRow[]>([]);
  const [stats, setStats] = useState<SupportStats>({
    total: 0,
    writing: 0,
    paused: 0,
    resume_requests: 0,
    offline: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "writing" | "paused" | "resume" | "offline">("all");
  const [search, setSearch] = useState("");
  const [examFilter, setExamFilter] = useState("");
  const [customMin, setCustomMin] = useState<Record<string, number>>({});
  const [busyKey, setBusyKey] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchSessions = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/v1/portal/support", { credentials: "include" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) {
        setSessions(json.sessions || []);
        setStats(
          json.stats || { total: 0, writing: 0, paused: 0, resume_requests: 0, offline: 0 }
        );
        setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      }
    } catch {
      if (!silent) showCtToast("Could not refresh live sessions.", "bad");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchSessions(true);
    // Free Vercel Hobby safe gentle 15s refresh ONLY while tab is visible
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchSessions(true);
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  const sendAction = async (
    payload: Record<string, unknown>,
    key: string,
    confirmMsg?: string
  ) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyKey(key);
    try {
      const res = await fetch("/api/v1/portal/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        showCtToast(json.message || "Action applied.", "ok");
        await fetchSessions(true);
      } else {
        showCtToast(json.message || "Could not complete action.", "bad");
      }
    } finally {
      setBusyKey("");
    }
  };

  const uniqueExams = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of sessions) map.set(s.exam_local_id, s.exam_name);
    return Array.from(map.entries());
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter === "writing" && (s.is_paused || s.resume_requested)) return false;
      if (statusFilter === "paused" && !s.is_paused) return false;
      if (statusFilter === "resume" && !s.resume_requested) return false;
      if (statusFilter === "offline" && s.connection === "active") return false;
      if (examFilter && String(s.exam_local_id) !== examFilter) return false;
      if (!q) return true;
      return `${s.student_name} ${s.student_username} ${s.student_class} ${s.exam_name}`
        .toLowerCase()
        .includes(q);
    });
  }, [sessions, statusFilter, examFilter, search]);

  return (
    <>
      <header className="tc-head">
        <div className="tc-head__txt">
          <span className="tc-eyebrow">
            {role === "admin" ? "School-Wide Live Invigilation" : "Live Examination Monitoring"}
          </span>
          <h1>Live Support &amp; Proctoring</h1>
          <p>
            Pause or resume individual students, approve unlock requests, grant extra minutes, reset warnings, or force submit active papers.
          </p>
        </div>
        <div className="tc-head__actions">
          {lastUpdated && (
            <span className="tc-mono" style={{ fontSize: 12, color: "var(--ct-ink-3)" }}>
              Synced {lastUpdated}
            </span>
          )}
          <button
            type="button"
            className="ct-btn ct-btn--soft"
            onClick={() => void fetchSessions(false)}
            disabled={refreshing}
          >
            <CtIco name="i-refresh" className="ct-ico--sm" />
            {refreshing ? "Refreshing..." : "Refresh Now"}
          </button>
        </div>
      </header>

      {/* Exact Offline 5-KPI Clickable Filter Strip (.ls-kpis) */}
      <section className="ls-kpis" aria-label="Live sitting summary">
        <button
          type="button"
          className={`ls-kpi${statusFilter === "all" ? " is-active" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          <span className="ls-kpi__label">Active Sessions</span>
          <strong className="ls-kpi__val">{stats.total}</strong>
          <span className="ls-kpi__sub">Total in progress</span>
        </button>
        <button
          type="button"
          className={`ls-kpi${statusFilter === "writing" ? " is-active" : ""}`}
          onClick={() => setStatusFilter("writing")}
        >
          <span className="ls-kpi__label">Writing Now</span>
          <strong className="ls-kpi__val">{stats.writing}</strong>
          <span className="ls-kpi__sub">Timer running live</span>
        </button>
        <button
          type="button"
          className={`ls-kpi${statusFilter === "paused" ? " is-active" : ""}`}
          onClick={() => setStatusFilter("paused")}
        >
          <span className="ls-kpi__label">Paused</span>
          <strong className="ls-kpi__val">{stats.paused}</strong>
          <span className="ls-kpi__sub">Clock frozen</span>
        </button>
        <button
          type="button"
          className={`ls-kpi${statusFilter === "resume" ? " is-active" : ""}`}
          onClick={() => setStatusFilter("resume")}
        >
          <span className="ls-kpi__label">Unlock Requests</span>
          <strong className="ls-kpi__val">{stats.resume_requests}</strong>
          <span className="ls-kpi__sub">Awaiting approval</span>
        </button>
        <button
          type="button"
          className={`ls-kpi${statusFilter === "offline" ? " is-active" : ""}`}
          onClick={() => setStatusFilter("offline")}
        >
          <span className="ls-kpi__label">Lagging / Offline</span>
          <strong className="ls-kpi__val">{stats.offline}</strong>
          <span className="ls-kpi__sub">No recent heartbeat</span>
        </button>
      </section>

      {/* Filter & Bulk Controls Bar (.ls-bar) */}
      <div className="ls-bar" style={{ marginTop: 14, marginBottom: 16 }}>
        <div className="ls-bar__left">
          <label className="tc-search" style={{ width: 240 }}>
            <CtIco name="i-search" className="ct-ico--sm" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, class, exam..."
            />
          </label>
          {uniqueExams.length > 0 && (
            <select
              className="tc-select"
              style={{ height: 36, minWidth: 180 }}
              value={examFilter}
              onChange={(e) => setExamFilter(e.target.value)}
            >
              <option value="">All Active Exams</option>
              {uniqueExams.map(([id, title]) => (
                <option key={id} value={String(id)}>
                  {title}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="ls-bar__right" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="ct-btn ct-btn--soft ct-btn--sm"
            disabled={!sessions.length || busyKey === "pause_all"}
            onClick={() =>
              void sendAction(
                { action: "pause_all", exam_local_id: examFilter ? Number(examFilter) : undefined },
                "pause_all",
                "Pause all currently active student sessions?"
              )
            }
          >
            <CtIco name="i-pause" className="ct-ico--xs" />
            Pause All
          </button>
          <button
            type="button"
            className="ct-btn ct-btn--soft ct-btn--sm"
            disabled={!sessions.length || busyKey === "resume_all"}
            onClick={() =>
              void sendAction(
                { action: "resume_all", exam_local_id: examFilter ? Number(examFilter) : undefined },
                "resume_all"
              )
            }
          >
            <CtIco name="i-play" className="ct-ico--xs" />
            Resume All
          </button>
          <button
            type="button"
            className="ct-btn ct-btn--danger-soft ct-btn--sm"
            disabled={!sessions.length || busyKey === "force_all"}
            onClick={() =>
              void sendAction(
                { action: "force_submit_all", exam_local_id: examFilter ? Number(examFilter) : undefined },
                "force_all",
                "Force submit ALL active student papers now? All saved answers will be graded immediately."
              )
            }
          >
            <CtIco name="i-stop" className="ct-ico--xs" />
            Force Submit All
          </button>
        </div>
      </div>

      {/* Live Student Session Cards Grid (.ls-grid) */}
      {loading ? (
        <div className="tc-card" style={{ padding: 40, textAlign: "center", color: "var(--ct-ink-3)" }}>
          Loading live exam sessions...
        </div>
      ) : filtered.length === 0 ? (
        <section className="tc-card">
          <div className="tc-empty">
            <span className="tc-empty__ico">
              <CtIco name="i-activity" />
            </span>
            <strong>No active student sessions right now</strong>
            <p>
              As soon as students begin an active online examination, their live timers, warning counts, and remote controls will appear here.
            </p>
          </div>
        </section>
      ) : (
        <div className="ls-grid">
          {filtered.map((s) => {
            const minsVal = customMin[s.id] ?? 5;
            return (
              <article
                key={s.id}
                className={`ls-card${s.resume_requested ? " is-urgent" : s.is_paused ? " is-paused" : ""}`}
              >
                <div className="ls-card__head">
                  <div className="ls-card__who">
                    <strong>{s.student_name}</strong>
                    <span>
                      @{s.student_username} · {s.student_class}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {s.resume_requested ? (
                      <span className="tc-pill tc-pill--warn">Unlock Requested</span>
                    ) : s.is_paused ? (
                      <span className="tc-pill tc-pill--warn">Paused</span>
                    ) : (
                      <span className="tc-pill tc-pill--ok">
                        <i className="tc-dot" />
                        Writing
                      </span>
                    )}
                    <span className="tc-pill">
                      {s.connection === "active"
                        ? "Online"
                        : s.connection === "lagging"
                          ? "Lagging"
                          : "Disconnected"}
                    </span>
                  </div>
                </div>

                <div className="ls-card__exam">
                  <strong>{s.exam_name}</strong>
                  <span>{s.answered_count} answered · Invigilator: {s.teacher_name}</span>
                </div>

                {s.resume_requested && s.resume_reason && (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--ct-border-2)",
                      background: "var(--ct-surface-2)",
                      fontSize: 12,
                      color: "var(--ct-ink)",
                    }}
                  >
                    <strong>Student note:</strong> {s.resume_reason}
                  </div>
                )}

                <div className="ls-card__metrics">
                  <div>
                    <span>Remaining</span>
                    <strong className="tc-mono">{fmtTime(s.remaining_seconds)}</strong>
                  </div>
                  <div>
                    <span>Warnings</span>
                    <strong className="tc-mono">
                      {s.warnings_count} / {s.max_warnings}
                    </strong>
                  </div>
                  <div>
                    <span>Last Ping</span>
                    <strong className="tc-mono">
                      {s.last_seen_seconds < 60 ? `${s.last_seen_seconds}s ago` : `${Math.floor(s.last_seen_seconds / 60)}m ago`}
                    </strong>
                  </div>
                </div>

                <div className="ls-card__actions">
                  {s.resume_requested ? (
                    <button
                      type="button"
                      className="ct-btn ct-btn--primary ct-btn--sm"
                      disabled={busyKey === `${s.id}:approve`}
                      onClick={() => void sendAction({ action: "approve_resume", attempt_id: s.id }, `${s.id}:approve`)}
                    >
                      <CtIco name="i-unlock" className="ct-ico--xs" />
                      Approve Unlock
                    </button>
                  ) : s.is_paused ? (
                    <button
                      type="button"
                      className="ct-btn ct-btn--primary ct-btn--sm"
                      disabled={busyKey === `${s.id}:resume`}
                      onClick={() => void sendAction({ action: "resume", attempt_id: s.id }, `${s.id}:resume`)}
                    >
                      <CtIco name="i-play" className="ct-ico--xs" />
                      Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ct-btn ct-btn--soft ct-btn--sm"
                      disabled={busyKey === `${s.id}:pause`}
                      onClick={() => void sendAction({ action: "pause", attempt_id: s.id }, `${s.id}:pause`)}
                    >
                      <CtIco name="i-pause" className="ct-ico--xs" />
                      Pause
                    </button>
                  )}

                  <button
                    type="button"
                    className="ct-btn ct-btn--soft ct-btn--sm"
                    disabled={busyKey === `${s.id}:+5`}
                    onClick={() => void sendAction({ action: "add_time", attempt_id: s.id, minutes: 5 }, `${s.id}:+5`)}
                  >
                    +5m
                  </button>
                  <button
                    type="button"
                    className="ct-btn ct-btn--soft ct-btn--sm"
                    disabled={busyKey === `${s.id}:+10`}
                    onClick={() => void sendAction({ action: "add_time", attempt_id: s.id, minutes: 10 }, `${s.id}:+10`)}
                  >
                    +10m
                  </button>
                  <button
                    type="button"
                    className="ct-btn ct-btn--soft ct-btn--sm"
                    disabled={busyKey === `${s.id}:-5`}
                    onClick={() => void sendAction({ action: "subtract_time", attempt_id: s.id, minutes: 5 }, `${s.id}:-5`)}
                  >
                    -5m
                  </button>

                  {s.warnings_count > 0 && (
                    <button
                      type="button"
                      className="ct-btn ct-btn--soft ct-btn--sm"
                      disabled={busyKey === `${s.id}:warn`}
                      onClick={() => void sendAction({ action: "reset_warnings", attempt_id: s.id }, `${s.id}:warn`)}
                    >
                      Reset Warnings
                    </button>
                  )}

                  <button
                    type="button"
                    className="ct-btn ct-btn--danger-soft ct-btn--sm"
                    disabled={busyKey === `${s.id}:force`}
                    onClick={() =>
                      void sendAction(
                        { action: "force_submit", attempt_id: s.id },
                        `${s.id}:force`,
                        `Force submit ${s.student_name}'s paper now?`
                      )
                    }
                  >
                    Force Submit
                  </button>
                </div>

                {/* Custom Time Adjustment */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 6, borderTop: "1px solid var(--ct-border)" }}>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={minsVal}
                    onChange={(e) => setCustomMin((prev) => ({ ...prev, [s.id]: Math.max(1, Number(e.target.value || 1)) }))}
                    className="tc-input tc-mono"
                    style={{ width: 72, height: 30, fontSize: 12 }}
                    aria-label="Custom minutes"
                  />
                  <span style={{ fontSize: 12, color: "var(--ct-ink-3)" }}>min</span>
                  <button
                    type="button"
                    className="ct-btn ct-btn--soft ct-btn--sm"
                    onClick={() => void sendAction({ action: "add_time", attempt_id: s.id, minutes: minsVal }, `${s.id}:cadd`)}
                  >
                    + Add
                  </button>
                  <button
                    type="button"
                    className="ct-btn ct-btn--soft ct-btn--sm"
                    onClick={() => void sendAction({ action: "subtract_time", attempt_id: s.id, minutes: minsVal }, `${s.id}:csub`)}
                  >
                    - Deduct
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
