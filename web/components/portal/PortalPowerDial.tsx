"use client";

import React, { useEffect, useRef, useState } from "react";
import { PIconCopy, PIconPower } from "./PortalIcons";

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
        setFeedback({ kind: "err", text: json.message || "Could not update Online Portal switch" });
      } else {
        setFeedback({ kind: "ok", text: json.message || "Portal settings saved" });
        await refresh();
        onSynced?.();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error while updating Online Portal" });
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
        setFeedback({ kind: "err", text: json.message || "Could not sync backup" });
      } else {
        setFeedback({ kind: "ok", text: json.message || "Database synced" });
        await refresh();
        onSynced?.();
      }
    } catch {
      setFeedback({ kind: "err", text: "Network error while syncing backup" });
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
        text: "File is over 4 MB. Upload via CogniTara Studio Desktop Cloud Backup, then click Sync Latest Backup.",
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
        setFeedback({ kind: "err", text: json.message || "Could not import database file" });
      } else {
        setFeedback({ kind: "ok", text: json.message || "Database imported" });
        await refresh();
        onSynced?.();
      }
    } catch {
      setFeedback({ kind: "err", text: "Could not upload exam database" });
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
      <div className="pt-card pt-card--pad" style={{ textAlign: "center", color: "var(--pt-ink-2)" }}>
        Loading Online Portal controls...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="pt-card pt-card--pad">
        <div className="pt-alert">Could not load Online Portal controls. Refresh the page and try again.</div>
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
        <div className="pt-dial-col">
          <button
            type="button"
            className={`pt-dial-btn ${masterOn ? "is-on" : ""}`}
            disabled={busyKey === "master"}
            onClick={() => patchControl({ online_portal_enabled: !masterOn }, "master")}
            aria-pressed={masterOn}
          >
            <PIconPower size={24} />
            <span className="pt-dial-state">
              {busyKey === "master" ? "..." : masterOn ? "Live" : "Off"}
            </span>
            <span className="pt-dial-label">
              {masterOn ? "Turn off portal" : "Turn on portal"}
            </span>
          </button>
          <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)", maxWidth: 204, lineHeight: 1.45 }}>
            {masterOn
              ? "Students and teachers can sign in online with your School ID"
              : "Online access is paused for staff and students. Admins retain access"}
          </div>
        </div>

        <div className="pt-power-body">
          <div className="pt-school-id-bar">
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--pt-ink-3)" }}>
                School ID
              </div>
              <div className="pt-school-id-code">{s.school_code}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                onClick={() => copyValue(s.school_code, "code")}
              >
                <PIconCopy size={13} />
                <span>{copied === "code" ? "Copied ID" : "Copy ID"}</span>
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                onClick={() => copyValue(data.portal_url, "url")}
              >
                {copied === "url" ? "Copied link" : "Copy portal link"}
              </button>
              <a
                href={data.portal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="pt-btn pt-btn--primary pt-btn--sm"
              >
                Open gateway
              </a>
            </div>
          </div>

          <div className="pt-toggles-grid">
            <div className="pt-toggle-card">
              <div>
                <strong>Teachers access</strong>
                <span>Author and manage exams from home</span>
              </div>
              <div className="pt-rocker" role="group" aria-label="Teachers access">
                <button
                  type="button"
                  className={`pt-rocker__opt ${!teachersOn ? "is-selected" : ""}`}
                  disabled={busyKey === "teachers" || !masterOn}
                  onClick={() => teachersOn && patchControl({ online_teachers_enabled: false }, "teachers")}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={`pt-rocker__opt ${teachersOn ? "is-selected" : ""}`}
                  disabled={busyKey === "teachers" || !masterOn}
                  onClick={() => !teachersOn && patchControl({ online_teachers_enabled: true }, "teachers")}
                >
                  On
                </button>
              </div>
            </div>

            <div className="pt-toggle-card">
              <div>
                <strong>Students access</strong>
                <span>Sit active exams from any browser</span>
              </div>
              <div className="pt-rocker" role="group" aria-label="Students access">
                <button
                  type="button"
                  className={`pt-rocker__opt ${!studentsOn ? "is-selected" : ""}`}
                  disabled={busyKey === "students" || !masterOn}
                  onClick={() => studentsOn && patchControl({ online_students_enabled: false }, "students")}
                >
                  Off
                </button>
                <button
                  type="button"
                  className={`pt-rocker__opt ${studentsOn ? "is-selected" : ""}`}
                  disabled={busyKey === "students" || !masterOn}
                  onClick={() => !studentsOn && patchControl({ online_students_enabled: true }, "students")}
                >
                  On
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12.5, color: "var(--pt-ink-2)" }}>
              Database sync:{" "}
              <strong style={{ color: "var(--pt-ink)", fontWeight: 600 }}>
                {fmtRelative(s.online_synced_at)}
              </strong>
              {c.unsynced_submissions > 0 ? (
                <span className="pt-mono" style={{ marginLeft: 10, color: "var(--pt-ink)" }}>
                  {c.unsynced_submissions} pending PC pull
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="pt-btn pt-btn--primary pt-btn--sm"
                disabled={busyKey === "sync" || data.backups.length === 0}
                onClick={() => void syncLatestBackup()}
              >
                {busyKey === "sync" ? "Syncing..." : "Sync latest cloud backup"}
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--sm"
                disabled={busyKey === "upload"}
                onClick={() => fileRef.current?.click()}
              >
                {busyKey === "upload" ? "Importing..." : "Upload .db file"}
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
            <form
              style={{ display: "flex", gap: 8, alignItems: "center" }}
              onSubmit={(e) => {
                e.preventDefault();
                void patchControl({ online_portal_notice: noticeDraft }, "notice");
              }}
            >
              <input
                type="text"
                className="pt-input"
                style={{ height: 36, fontSize: 13 }}
                value={noticeDraft}
                maxLength={280}
                placeholder="Optional notice banner shown on portal sign-in"
                onChange={(e) => setNoticeDraft(e.target.value)}
              />
              <button
                type="submit"
                className="pt-btn pt-btn--sm"
                disabled={busyKey === "notice"}
              >
                {busyKey === "notice" ? "Saving..." : "Save notice"}
              </button>
            </form>
          ) : null}

          {feedback ? (
            <div className={`pt-alert ${feedback.kind === "err" ? "pt-alert--dark" : ""}`}>
              {feedback.text}
            </div>
          ) : null}
        </div>
      </div>

      {!compact ? (
        <div className="pt-kpi-rail">
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Students synced</span>
            <strong className="pt-kpi-cell__val">{c.students}</strong>
            <span className="pt-kpi-cell__meta">
              {c.pending_students > 0 ? `${c.pending_students} pending` : "All approved"}
            </span>
          </div>
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Teachers synced</span>
            <strong className="pt-kpi-cell__val">{c.teachers}</strong>
            <span className="pt-kpi-cell__meta">Faculty accounts</span>
          </div>
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Active exams</span>
            <strong className="pt-kpi-cell__val">{c.active_exams} / {c.exams}</strong>
            <span className="pt-kpi-cell__meta">{c.questions} questions</span>
          </div>
          <div className="pt-kpi-cell">
            <span className="pt-kpi-cell__label">Online submissions</span>
            <strong className="pt-kpi-cell__val">{c.online_submissions}</strong>
            <span className="pt-kpi-cell__meta">
              {c.online_created_exams} authored online
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
