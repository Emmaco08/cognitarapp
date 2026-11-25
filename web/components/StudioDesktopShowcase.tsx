"use client";

import React, { useEffect, useRef, useState } from "react";
import { IconCheck, IconShield } from "./Icons";

type RailView = "server" | "live" | "billing" | "backups";

interface LiveExamRow {
  id: string;
  name: string;
  cls: string;
  writing: number;
  total: number;
  progress: number;
  leftSec: number;
}

const INITIAL_EXAMS: LiveExamRow[] = [
  { id: "mth", name: "First Term Mathematics CBT", cls: "JSS 2", writing: 31, total: 34, progress: 68, leftSec: 1420 },
  { id: "ce", name: "2026/2027 Common Entrance", cls: "Entrance", writing: 48, total: 50, progress: 44, leftSec: 2180 },
  { id: "phy", name: "Physics Practical Objective", cls: "SS 3", writing: 27, total: 28, progress: 82, leftSec: 690 },
];

function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function fmtUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function StudioDesktopShowcase() {
  const [view, setView] = useState<RailView>("server");
  const [running, setRunning] = useState(true);
  const [uptimeSec, setUptimeSec] = useState(5014);
  const [exams, setExams] = useState<LiveExamRow[]>(INITIAL_EXAMS);
  const [backupJustRan, setBackupJustRan] = useState(false);
  const [samples, setSamples] = useState<number[]>(() =>
    Array.from({ length: 36 }, (_, i) => 16 + Math.round(Math.sin(i * 0.45) * 7 + (i % 4) * 2))
  );

  const sparkRef = useRef<HTMLCanvasElement | null>(null);
  const pulseRef = useRef<HTMLCanvasElement | null>(null);

  // Live 1-second desktop heartbeat simulation (respects reduced motion)
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const timer = window.setInterval(() => {
      if (running) {
        setUptimeSec((u) => u + 1);
        setExams((prev) =>
          prev.map((ex) => ({
            ...ex,
            leftSec: ex.leftSec > 60 ? ex.leftSec - 1 : ex.leftSec,
          }))
        );
        setSamples((prev) => {
          const nextVal = Math.max(8, Math.min(44, 22 + Math.round(Math.sin(Date.now() / 1300) * 9 + Math.cos(Date.now() / 700) * 5)));
          return [...prev.slice(1), nextVal];
        });
      } else {
        setSamples((prev) => [...prev.slice(1), 0]);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // Paint titlebar sparkline & server traffic wave
  useEffect(() => {
    const drawLine = (canvas: HTMLCanvasElement | null, stroke: string, fill: boolean) => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || canvas.width;
      const h = canvas.clientHeight || canvas.height;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const max = Math.max(20, ...samples) * 1.15;
      const stepX = w / Math.max(1, samples.length - 1);
      ctx.beginPath();
      samples.forEach((v, i) => {
        const x = i * stepX;
        const y = h - 3 - (v / max) * (h - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = fill ? 1.8 : 1.5;
      ctx.lineJoin = "round";
      ctx.stroke();

      if (fill) {
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "rgba(59, 130, 246, 0.24)");
        grad.addColorStop(1, "rgba(59, 130, 246, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    drawLine(sparkRef.current, running ? "#34D399" : "#71717A", false);
    drawLine(pulseRef.current, running ? "#3B82F6" : "#71717A", true);
  }, [samples, running, view]);

  const totalWriting = running ? exams.reduce((sum, e) => sum + e.writing, 0) : 0;
  const connectedDevices = running ? totalWriting + 6 : 0;

  function addFiveMinutes(examId: string) {
    setExams((prev) =>
      prev.map((ex) => (ex.id === examId ? { ...ex, leftSec: ex.leftSec + 300 } : ex))
    );
  }

  function triggerDemoBackup() {
    setBackupJustRan(true);
    window.setTimeout(() => setBackupJustRan(false), 3200);
  }

  return (
    <div className="sd-frame" role="region" aria-label="Interactive CogniTara Studio desktop preview">
      {/* Real Windows 11 Studio Titlebar */}
      <div className="sd-titlebar">
        <div className="sd-tb-brand">
          <span className="sd-appicon" aria-hidden="true">
            <svg viewBox="0 0 200 200" width="16" height="16">
              <path
                fill="#FFFFFF"
                d="M 150.91,150.91 C 122.79,179.03 77.21,179.03 49.09,150.91 C 20.97,122.79 20.97,77.21 49.09,49.09 C 77.21,20.97 122.79,20.97 150.91,49.09 L 131.11,68.89 C 113.93,51.70 86.07,51.70 68.89,68.89 C 51.70,86.07 51.70,113.93 68.89,131.11 C 86.07,148.30 113.93,148.30 131.11,131.11 Z"
              />
              <path
                fill="#00D2FF"
                d="M 108.00,74.00 C 115.00,93.00 115.00,93.00 146.00,100.00 C 115.00,107.00 115.00,107.00 108.00,126.00 C 101.00,107.00 101.00,107.00 90.00,100.00 C 101.00,93.00 101.00,93.00 108.00,74.00 Z"
              />
            </svg>
          </span>
          <strong className="sd-tb-name">CogniTara</strong>
          <span className="sd-tb-edition">Studio</span>
        </div>

        <div className="sd-tb-school">
          <span className="sd-crest">CH</span>
          <span className="sd-school-txt">
            <strong>Cedar Hills Academy</strong>
            <em>First Term, 2026/2027</em>
          </span>
        </div>

        <div className="sd-tb-search" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <span>Search or run a command</span>
          <kbd>Ctrl</kbd>
          <kbd>K</kbd>
        </div>

        <div className="sd-tb-right">
          <div className={`sd-tb-status ${running ? "is-on" : ""}`}>
            <span className="sd-status-dot" />
            <span className="sd-status-copy">
              <strong>{running ? "Server running" : "Server paused"}</strong>
              <em className="mono">{running ? "192.168.10.24:5000" : "Ready on LAN"}</em>
            </span>
            <canvas ref={sparkRef} className="sd-spark" width={52} height={18} aria-hidden="true" />
          </div>

          <div className="sd-win-ctrls" aria-hidden="true">
            <span className="sd-wbtn">
              <svg viewBox="0 0 16 16" width="11" height="11" stroke="currentColor" strokeWidth="1.5" fill="none">
                <path d="M3 8.5h10" />
              </svg>
            </span>
            <span className="sd-wbtn">
              <svg viewBox="0 0 16 16" width="11" height="11" stroke="currentColor" strokeWidth="1.5" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="1.2" />
              </svg>
            </span>
            <span className="sd-wbtn sd-wbtn--close">
              <svg viewBox="0 0 16 16" width="11" height="11" stroke="currentColor" strokeWidth="1.5" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* Real Studio Shell: Left Navigation Rail + Content Surface */}
      <div className="sd-shell">
        <nav className="sd-rail" aria-label="CogniTara Studio sections">
          <div className="sd-rail-nav" role="tablist">
            {(
              [
                { id: "server", label: "Server", count: null },
                { id: "live", label: "Live exams", count: running ? exams.length : 0 },
                { id: "billing", label: "Plans & billing", count: null },
                { id: "backups", label: "Cloud backups", count: null },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                className={`sd-rail-btn ${view === item.id ? "is-active" : ""}`}
                onClick={() => setView(item.id)}
              >
                <span className="sd-rail-bar" aria-hidden="true" />
                <span>{item.label}</span>
                {item.count ? <b className="sd-rail-cnt tnum">{item.count}</b> : null}
              </button>
            ))}
          </div>

          {/* Bottom-Left Real Licence Ring Gauge */}
          <div className="sd-rail-lic">
            <svg viewBox="0 0 36 36" width="30" height="30" aria-hidden="true">
              <circle cx="18" cy="18" r="14" fill="none" stroke="var(--border-2)" strokeWidth="2.6" />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.6"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="100"
                strokeDashoffset="21"
                transform="rotate(-90 18 18)"
              />
            </svg>
            <div className="sd-rail-lic-txt">
              <strong>Annual plan</strong>
              <em className="tnum">287 days left</em>
            </div>
          </div>
        </nav>

        <div className="sd-views">
          {view === "server" ? (
            <div className="sd-home-grid">
              {/* Real Studio Server Core Dial Card */}
              <div className={`sd-card sd-core ${running ? "is-running" : ""}`}>
                <button
                  type="button"
                  className="sd-dial"
                  onClick={() => setRunning((r) => !r)}
                  aria-label={running ? "Stop exam server" : "Start exam server"}
                >
                  <svg viewBox="0 0 200 200" width="96" height="96" aria-hidden="true">
                    <path
                      className="sd-dial-base"
                      d="M 150.91,150.91 C 122.79,179.03 77.21,179.03 49.09,150.91 C 20.97,122.79 20.97,77.21 49.09,49.09 C 77.21,20.97 122.79,20.97 150.91,49.09 L 131.11,68.89 C 113.93,51.70 86.07,51.70 68.89,68.89 C 51.70,86.07 51.70,113.93 68.89,131.11 C 86.07,148.30 113.93,148.30 131.11,131.11 Z"
                    />
                    <circle
                      className="sd-dial-ring"
                      cx="100"
                      cy="100"
                      r="86"
                      pathLength={100}
                    />
                    <path
                      className="sd-dial-star"
                      d="M 108.00,74.00 C 115.00,93.00 115.00,93.00 146.00,100.00 C 115.00,107.00 115.00,107.00 108.00,126.00 C 101.00,107.00 101.00,107.00 90.00,100.00 C 101.00,93.00 101.00,93.00 108.00,74.00 Z"
                    />
                  </svg>
                </button>
                <div className="sd-core-info">
                  <div className="sd-core-state">
                    <i />
                    <span>{running ? "Online on school network" : "Offline"}</span>
                  </div>
                  <h3>{running ? "Server is running" : "Server is paused"}</h3>
                  <p>
                    {running
                      ? "Students on the school Wi-Fi or lab cables can sign in and write with zero internet required."
                      : "Every open answer was flushed cleanly to SQLite WAL. Click below to resume the hall."}
                  </p>
                  <button
                    type="button"
                    className={running ? "btn btn--outline btn--sm" : "btn btn--primary btn--sm"}
                    onClick={() => setRunning((r) => !r)}
                  >
                    {running ? "Stop exam server" : "Start exam server"}
                  </button>
                </div>
              </div>

              {/* Real Student Connect QR Card */}
              <div className="sd-card sd-connect">
                <div className="sd-qr" aria-hidden="true">
                  <svg viewBox="0 0 21 21" width="76" height="76" shapeRendering="crispEdges">
                    <rect width="21" height="21" fill="var(--bg)" rx="2" />
                    <path
                      fill="var(--ink)"
                      d="M2 2h6v6H2zm1 1v4h4V3zm1 1h2v2H4zm9-2h6v6h-6zm1 1v4h4V3zm1 1h2v2h-2zM2 13h6v6H2zm1 1v4h4v-4zm1 1h2v2H4zm6-13h1v2h-1zm0 4h2v1h-2zm-1 3h2v2H9zm3 0h2v1h-2zm3 0h2v2h-2zm3 1h1v2h-1zm-9 2h1v3H9zm2 1h3v1h-3zm4 1h2v2h-2zm-4 2h2v3h-2zm3 1h1v2h-1zm2 0h2v2h-2zm-9-6h2v1H6zm-4 0h3v1H2zm2 2h2v1H4z"
                    />
                  </svg>
                </div>
                <div className="sd-connect-body">
                  <span>Students open in any browser</span>
                  <code className="mono">http://192.168.10.24:5000</code>
                  <em>or http://exam-server-01:5000</em>
                </div>
              </div>

              {/* 4 Crisp Live Server Counters */}
              <div className="sd-stats-row">
                <div className="sd-stat">
                  <span>Connected devices</span>
                  <strong className="tnum">{connectedDevices}</strong>
                  <em>{running ? "Active on school LAN" : "Server paused"}</em>
                </div>
                <div className="sd-stat">
                  <span>Exams running</span>
                  <strong className="tnum">{running ? exams.length : 0}</strong>
                  <em>14 papers published</em>
                </div>
                <div className="sd-stat">
                  <span>Students writing</span>
                  <strong className="tnum">{totalWriting}</strong>
                  <em>486 approved</em>
                </div>
                <div className="sd-stat">
                  <span>Hall uptime</span>
                  <strong className="mono">{running ? fmtUptime(uptimeSec) : "00:00:00"}</strong>
                  <em>{running ? "Zero dropouts" : "Stopped cleanly"}</em>
                </div>
              </div>

              {/* Real Live Traffic Canvas */}
              <div className="sd-card sd-pulse">
                <div className="sd-pulse-head">
                  <strong>Local LAN request stream</strong>
                  <span className="tnum">{running ? `${samples[samples.length - 1] * 14} req/min` : "0 req/min"}</span>
                </div>
                <canvas ref={pulseRef} className="sd-pulse-canvas" height={64} aria-hidden="true" />
              </div>
            </div>
          ) : view === "live" ? (
            <div className="sd-panel-view">
              <div className="sd-panel-head">
                <div>
                  <h3>Live exam hall supervision</h3>
                  <p>Track class progress in real time and extend exam clocks with one click.</p>
                </div>
              </div>
              <div className="sd-table-wrap">
                <table className="sd-table">
                  <thead>
                    <tr>
                      <th>Examination</th>
                      <th>Class</th>
                      <th>Writing</th>
                      <th>Progress</th>
                      <th>Time left</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {exams.map((ex) => (
                      <tr key={ex.id}>
                        <td>
                          <strong>{ex.name}</strong>
                        </td>
                        <td>{ex.cls}</td>
                        <td className="tnum">
                          {running ? ex.writing : 0} / {ex.total}
                        </td>
                        <td>
                          <div className="sd-prog">
                            <i style={{ width: `${ex.progress}%` }} />
                          </div>
                        </td>
                        <td className="mono">{fmtClock(ex.leftSec)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--outline btn--xs"
                            onClick={() => addFiveMinutes(ex.id)}
                          >
                            +5 min
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : view === "billing" ? (
            <div className="sd-panel-view">
              <div className="sd-panel-head">
                <div>
                  <h3>Embedded Paystack SDK checkout inside Studio</h3>
                  <p>No popup browser windows. Schools pay inline and lock their Ed25519 licence immediately.</p>
                </div>
              </div>
              <div className="sd-billing-preview">
                <div className="sd-card sd-bp-left">
                  <div className="sd-bp-seal">
                    <IconCheck size={20} />
                  </div>
                  <strong>Payment confirmed &amp; licence signed</strong>
                  <p>Card, bank transfer, and USSD receipts verify directly against CogniTara Cloud and bind to the school PC.</p>
                </div>
                <div className="sd-card sd-bp-ledger">
                  <div className="sd-ledger-row">
                    <span>Selected plan</span>
                    <strong>Annual School Plan</strong>
                  </div>
                  <div className="sd-ledger-row">
                    <span>Checkout SDK</span>
                    <strong>Paystack Inline v2 (in-app)</strong>
                  </div>
                  <div className="sd-ledger-row">
                    <span>Ed25519 Licence Key</span>
                    <code className="mono" style={{ color: "var(--ok)" }}>
                      CGNT-8F4B-7E2C-91A0
                    </code>
                  </div>
                  <div className="sd-ledger-row">
                    <span>Offline lease window</span>
                    <strong>30 days per check-in</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="sd-panel-view">
              <div className="sd-panel-head">
                <div>
                  <h3>Local SQLite &amp; encrypted Cloud snapshots</h3>
                  <p>Automatic local copies every 30 minutes plus one-click compressed backup to CogniTara Cloud.</p>
                </div>
                <button type="button" className="btn btn--primary btn--sm" onClick={triggerDemoBackup}>
                  {backupJustRan ? "Snapshot verified" : "Back up to Cloud"}
                </button>
              </div>
              <div className="sd-card sd-backup-list">
                {backupJustRan ? (
                  <div className="sd-bk-row is-fresh">
                    <div>
                      <strong>Exam Backup (Just now)</strong>
                      <em className="mono">SHA-256 verified · 18 exams · 1,420 questions · 486 scores</em>
                    </div>
                    <span className="sd-bk-ok">
                      <IconShield size={14} /> Synced
                    </span>
                  </div>
                ) : null}
                <div className="sd-bk-row">
                  <div>
                    <strong>First Term Midterm Snapshot</strong>
                    <em className="mono">311 KB gzip · Encrypted on CogniTara Cloud</em>
                  </div>
                  <span className="sd-bk-ok">
                    <IconCheck size={14} /> Verified
                  </span>
                </div>
                <div className="sd-bk-row">
                  <div>
                    <strong>Local Auto-Backup (exam_auto_0840.db)</strong>
                    <em className="mono">742 KB · C:\ProgramData\CogniTara\Backups</em>
                  </div>
                  <span className="sd-bk-ok">
                    <IconCheck size={14} /> Local safe
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
