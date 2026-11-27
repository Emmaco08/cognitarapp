"use client";

import React, { useEffect, useRef, useState } from "react";
import "@/app/portal/portal.css";

export interface PortalControlData {
  school: {
    id: string;
    school_code: string;
    school_name: string;
    portal_school_name?: string;
    online_portal_enabled: boolean;
    online_teachers_enabled: boolean;
    online_students_enabled: boolean;
    online_portal_notice: string;
    online_synced_at: string | null;
  };
  portal_url: string;
  fallback_portal_url: string;
  counts: {
    admins: number;
    teachers: number;
    students: number;
    pending_students: number;
    exams: number;
    active_exams: number;
    questions: number;
    online_submissions: number;
    unsynced_submissions: number;
    online_created_exams: number;
  };
  backups: Array<{
    id: string;
    filename: string;
    label: string;
    raw_size_bytes: number;
    created_at: string;
  }>;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "Not synced yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Synced";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PortalPowerDial({
  compact = false,
  onSynced,
}: {
  compact?: boolean;
  onSynced?: () => void;
}) {
  const [data, setData] = useState<PortalControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string>("");
  const [noticeDraft, setNoticeDraft] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/v1/portal/control", { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setData(json);
        setNoticeDraft(String(json.school?.online_portal_notice || ""));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function patchControl(patch: Record<string, unknown>, key: string) {
    setBusyKey(key);
    setFeedback(null);
    try {
      const res = await fetch("/api/v1/portal/control", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setFeedback({ kind: "err", text: json.message || "Could not update Online Portal switch." });
      } else {
        setFeedback({ kind: "ok", text: json.message || "Updated." });
        await refresh();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error while updating Online Portal." });
    } finally {
      setBusyKey("");
    }
  }

  async function syncLatestBackup() {
    setBusyKey("sync");
    setFeedback(null);
    try {
      const res = await fetch("/api/v1/portal/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setFeedback({ kind: "err", text: json.message || "Could not sync backup." });
      } else {
        setFeedback({ kind: "ok", text: json.message || "Database synced." });
        await refresh();
        onSynced?.();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error while syncing backup." });
    } finally {
      setBusyKey("");
    }
  }

  async function handleDirectUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setFeedback({
        kind: "err",
        text: "File is over 4 MB. Use CogniTara Studio Desktop Cloud Backup, then click Sync Latest Backup.",
      });
      return;
    }
    setBusyKey("upload");
    setFeedback(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 8192) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const payload_b64 = btoa(bin);
      const res = await fetch("/api/v1/portal/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload_b64 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setFeedback({ kind: "err", text: json.message || "Could not import database file." });
      } else {
        setFeedback({ kind: "ok", text: json.message || "Database imported." });
        await refresh();
        onSynced?.();
      }
    } catch {
      setFeedback({ kind: "err", text: "Could not upload exam database." });
    } finally {
      setBusyKey("");
    }
  }

  function copyValue(val: string, tag: string) {
    navigator.clipboard?.writeText(val).catch(() => {});
    setCopied(tag);
    setTimeout(() => setCopied((cur) => (cur === tag ? "" : cur)), 1800);
  }

  if (loading) {
    return (
      <div className="pt-card" style={{ padding: 28, textAlign: "center", color: "var(--pt-ink-2)" }}>
        Loading Online Exam Portal controls...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pt-card" style={{ padding: 24 }}>
        <div className="pt-alert">Could not load Online Exam Portal controls. Refresh the page and try again.</div>
      </div>
    );
  }

  const s = data.school;
  const c = data.counts;
  const masterOn = Boolean(s.online_portal_enabled);
  const teachersOn = Boolean(s.online_teachers_enabled);
  const studentsOn = Boolean(s.online_students_enabled);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="pt-power-shell">
        {/* Left: Obsidian / Warm Stone Master ON/OFF Dial */}
        <div className="pt-dial-col">
          <button
            type="button"
            className={`pt-dial-btn ${masterOn ? "is-on" : ""}`}
            disabled={busyKey === "master"}
            onClick={() => patchControl({ online_portal_enabled: !masterOn }, "master")}
            aria-pressed={masterOn}
          >
            <span className="pt-dial-ring" aria-hidden="true" />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2v8" />
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            </svg>
            <span className="pt-dial-state">
              {busyKey === "master" ? "..." : masterOn ? "LIVE" : "OFF"}
            </span>
            <span className="pt-dial-label">
              {masterOn ? "Tap to turn OFF" : "Tap to turn ON"}
            </span>
          </button>
          <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)", maxWidth: 200, lineHeight: 1.4 }}>
            {masterOn
              ? "Students and teachers can sign in online using your School ID."
              : "Online portal is paused for students and teachers. Admins can still sign in."}
          </div>
        </div>

        {/* Right: School ID + Granular Role Switches + Sync Actions */}
        <div className="pt-power-body">
          <div className="pt-school-id-bar">
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pt-ink-2)" }}>
                School ID (share with staff & students)
              </div>
              <div className="pt-school-id-code">{s.school_code}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                onClick={() => copyValue(s.school_code, "code")}
              >
                {copied === "code" ? "Copied ID" : "Copy ID"}
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                onClick={() => copyValue(data.portal_url, "link")}
              >
                {copied === "link" ? "Copied Link" : "Copy Portal Link"}
              </button>
              <a
                href={`/portal?school=${encodeURIComponent(s.school_code)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="pt-btn pt-btn--primary pt-btn--sm"
              >
                Open Portal
              </a>
            </div>
          </div>

          <div className="pt-toggles-grid">
            <div className="pt-toggle-card">
              <div>
                <strong>Teachers Access</strong>
                <span>
                  {masterOn && teachersOn
                    ? "Teachers can set exams from home"
                    : !masterOn
                      ? "Master switch is OFF"
                      : "Blocked from online sign-in"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={teachersOn}
                aria-label="Toggle Teachers Online Access"
                disabled={busyKey === "teachers"}
                className={`pt-switch ${teachersOn ? "is-on" : ""}`}
                onClick={() => patchControl({ online_teachers_enabled: !teachersOn }, "teachers")}
              />
            </div>

            <div className="pt-toggle-card">
              <div>
                <strong>Students Access</strong>
                <span>
                  {masterOn && studentsOn
                    ? "Students can take active exams online"
                    : !masterOn
                      ? "Master switch is OFF"
                      : "Blocked from online sign-in"}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={studentsOn}
                aria-label="Toggle Students Online Access"
                disabled={busyKey === "students"}
                className={`pt-switch ${studentsOn ? "is-on" : ""}`}
                onClick={() => patchControl({ online_students_enabled: !studentsOn }, "students")}
              />
            </div>
          </div>

          {/* Database sync row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)" }}>
              Database sync: <strong style={{ color: "var(--pt-ink)" }}>{fmtRelative(s.online_synced_at)}</strong>
              {c.unsynced_submissions > 0 ? (
                <span className="pt-pill" style={{ marginLeft: 8 }}>
                  {c.unsynced_submissions} new online score{c.unsynced_submissions === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="pt-btn pt-btn--primary pt-btn--sm"
                disabled={busyKey === "sync" || data.backups.length === 0}
                onClick={syncLatestBackup}
              >
                {busyKey === "sync" ? "Syncing..." : "Sync Latest Cloud Backup"}
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                disabled={busyKey === "upload"}
                onClick={() => fileRef.current?.click()}
              >
                {busyKey === "upload" ? "Importing..." : "Upload .db File"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".db,.sqlite,.sqlite3,.gz"
                style={{ display: "none" }}
                onChange={handleDirectUpload}
              />
            </div>
          </div>

          {!compact ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="text"
                className="pt-input"
                style={{ flex: "1 1 240px", height: 36, fontSize: 13 }}
                value={noticeDraft}
                onChange={(e) => setNoticeDraft(e.target.value)}
                placeholder="Optional notice shown on your school portal login (e.g. Second Term Exams open 9am to 2pm)"
                maxLength={240}
              />
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                style={{ height: 36 }}
                disabled={busyKey === "notice"}
                onClick={() => patchControl({ online_portal_notice: noticeDraft }, "notice")}
              >
                {busyKey === "notice" ? "Saving..." : "Save Notice"}
              </button>
            </div>
          ) : null}

          {feedback ? (
            <div className={`pt-alert ${feedback.kind === "ok" ? "" : "pt-alert--dark"}`}>
              {feedback.text}
            </div>
          ) : null}
        </div>
      </div>

      {/* Synced School Inventory Strip */}
      <div className="pt-stats-strip">
        <div className="pt-stat-tile">
          <div className="pt-stat-num">{c.students}</div>
          <div className="pt-stat-lbl">Students ({c.pending_students} pending)</div>
        </div>
        <div className="pt-stat-tile">
          <div className="pt-stat-num">{c.teachers}</div>
          <div className="pt-stat-lbl">Teachers</div>
        </div>
        <div className="pt-stat-tile">
          <div className="pt-stat-num">{c.active_exams} / {c.exams}</div>
          <div className="pt-stat-lbl">Active Exams ({c.questions} Qs)</div>
        </div>
        <div className="pt-stat-tile">
          <div className="pt-stat-num">{c.online_submissions}</div>
          <div className="pt-stat-lbl">Online Submissions</div>
        </div>
      </div>
    </div>
  );
}
