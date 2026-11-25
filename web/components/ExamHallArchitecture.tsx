"use client";

import React, { useState } from "react";

export function ExamHallArchitecture() {
  const [internetDown, setInternetDown] = useState(true);

  return (
    <div className="arch-stage">
      <div className="arch-head">
        <div>
          <h2 className="lp-h2">Exam halls keep running when school internet drops.</h2>
          <p className="lp-body">
            Toggle the school internet connection below to see how CogniTara separates local exam
            delivery from optional cloud syncing.
          </p>
        </div>

        <div className="lp-seg" role="group" aria-label="Simulate network state">
          <button
            type="button"
            className={internetDown ? "is-active" : ""}
            onClick={() => setInternetDown(true)}
          >
            Internet cut (Exam day)
          </button>
          <button
            type="button"
            className={!internetDown ? "is-active" : ""}
            onClick={() => setInternetDown(false)}
          >
            Internet on (Cloud sync)
          </button>
        </div>
      </div>

      {/* Animated Motion-Graphics Network Architecture SVG */}
      <div className={`arch-canvas ${internetDown ? "is-offline" : "is-online"}`}>
        <svg
          className="arch-svg"
          viewBox="0 0 960 336"
          role="img"
          aria-label="Animated diagram showing student devices connecting over local school Wi-Fi to the Windows exam server PC, independent of the internet link to CogniTara Cloud."
        >
          <defs>
            <linearGradient id="archLanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--ok)" stopOpacity="0.9" />
            </linearGradient>
          </defs>

          {/* Subtle architectural dot grid */}
          <g className="arch-grid" opacity="0.28">
            <line x1="0" y1="80" x2="960" y2="80" stroke="var(--border-2)" strokeDasharray="3 6" />
            <line x1="0" y1="160" x2="960" y2="160" stroke="var(--border-2)" strokeDasharray="3 6" />
            <line x1="0" y1="240" x2="960" y2="240" stroke="var(--border-2)" strokeDasharray="3 6" />
          </g>

          {/* Cloud Link Path (Left -> Center) */}
          <path
            d="M 190 160 L 395 160"
            className="arch-track arch-track--cloud"
            fill="none"
          />
          {!internetDown ? (
            <path
              d="M 190 160 L 395 160"
              className="arch-packet arch-packet--cloud"
              fill="none"
            />
          ) : (
            <g className="arch-cut-mark" transform="translate(292, 160)">
              <circle r="15" fill="var(--bg)" stroke="var(--warn)" strokeWidth="1.8" />
              <path d="M -5 -5 L 5 5 M 5 -5 L -5 5" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" />
            </g>
          )}

          {/* Local School LAN Paths (Center -> 3 Student Devices) — ALWAYS ACTIVE! */}
          <path d="M 555 140 C 640 140, 650 68, 748 68" className="arch-track arch-track--lan" fill="none" />
          <path d="M 555 160 L 748 160" className="arch-track arch-track--lan" fill="none" />
          <path d="M 555 180 C 640 180, 650 252, 748 252" className="arch-track arch-track--lan" fill="none" />

          {/* Live animated data packets streaming over school Wi-Fi */}
          <path d="M 555 140 C 640 140, 650 68, 748 68" className="arch-packet arch-packet--a" fill="none" stroke="url(#archLanGrad)" />
          <path d="M 555 160 L 748 160" className="arch-packet arch-packet--b" fill="none" stroke="url(#archLanGrad)" />
          <path d="M 555 180 C 640 180, 650 252, 748 252" className="arch-packet arch-packet--c" fill="none" stroke="url(#archLanGrad)" />

          {/* NODE 1: CogniTara Cloud */}
          <g transform="translate(24, 102)">
            <rect width="166" height="116" rx="14" className="arch-node" />
            <circle cx="28" cy="30" r="5" fill={internetDown ? "var(--warn)" : "var(--ok)"} />
            <text x="42" y="34" className="arch-node-status">
              {internetDown ? "Paused offline" : "Sync active"}
            </text>
            <text x="20" y="64" className="arch-node-title">CogniTara Cloud</text>
            <text x="20" y="84" className="arch-node-sub">Licences, receipts &amp;</text>
            <text x="20" y="100" className="arch-node-sub">encrypted DB backups</text>
          </g>

          {/* NODE 2: Windows Server PC (Center Hub) */}
          <g transform="translate(395, 76)">
            <rect width="160" height="168" rx="18" className="arch-node arch-node--hub" />
            <circle cx="80" cy="48" r="26" className="arch-hub-halo" />
            <g transform="translate(56, 24) scale(0.24)">
              <path
                fill="var(--ink)"
                d="M 150.91,150.91 C 122.79,179.03 77.21,179.03 49.09,150.91 C 20.97,122.79 20.97,77.21 49.09,49.09 C 77.21,20.97 122.79,20.97 150.91,49.09 L 131.11,68.89 C 113.93,51.70 86.07,51.70 68.89,68.89 C 51.70,86.07 51.70,113.93 68.89,131.11 C 86.07,148.30 113.93,148.30 131.11,131.11 Z"
              />
              <path
                fill="var(--accent)"
                d="M 108.00,74.00 C 115.00,93.00 115.00,93.00 146.00,100.00 C 115.00,107.00 115.00,107.00 108.00,126.00 C 101.00,107.00 101.00,107.00 90.00,100.00 C 101.00,93.00 101.00,93.00 108.00,74.00 Z"
              />
            </g>
            <text x="80" y="96" textAnchor="middle" className="arch-node-title">School Windows PC</text>
            <text x="80" y="116" textAnchor="middle" className="arch-node-sub">SQLite WAL auto-save</text>
            <text x="80" y="142" textAnchor="middle" className="arch-node-ok">100% online on LAN</text>
          </g>

          {/* NODE 3A, 3B, 3C: Student Exam Devices */}
          {[
            { y: 34, label: "Lab Desktops", detail: "Q14 saved · 8ms LAN" },
            { y: 126, label: "School Laptops", detail: "Auto-pause safe · 0 drops" },
            { y: 218, label: "Exam Tablets", detail: "Browser-only · No install" },
          ].map((dev) => (
            <g key={dev.label} transform={`translate(748, ${dev.y})`}>
              <rect width="188" height="68" rx="12" className="arch-node" />
              <circle cx="22" cy="26" r="4.5" fill="var(--ok)" />
              <text x="34" y="30" className="arch-node-title">{dev.label}</text>
              <text x="22" y="50" className="arch-node-sub">{dev.detail}</text>
            </g>
          ))}

          {/* Link captions */}
          <text x="292" y="198" textAnchor="middle" className="arch-caption">
            {internetDown ? "No internet needed during exams" : "Encrypted backup & licence sync"}
          </text>
          <text x="652" y="316" textAnchor="middle" className="arch-caption arch-caption--ok">
            School Wi-Fi / LAN · Up to 300 devices simultaneously
          </text>
        </svg>
      </div>
    </div>
  );
}
