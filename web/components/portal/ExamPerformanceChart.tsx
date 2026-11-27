"use client";

import React from "react";

interface ExamMetric {
  local_id: number;
  name: string;
  avg_percentage: number | null;
}

function truncateLabel(s: string, max = 18): string {
  const clean = String(s || "").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

export function ExamPerformanceChart({ exams }: { exams: ExamMetric[] }) {
  const items = exams.slice(0, 8);
  if (!items.length) return null;

  const scored = items.filter((e) => e.avg_percentage !== null && Number.isFinite(Number(e.avg_percentage)));
  const overallAvg = scored.length
    ? Number((scored.reduce((acc, e) => acc + Number(e.avg_percentage || 0), 0) / scored.length).toFixed(1))
    : 0;
  const maxVal = scored.length ? Math.max(...scored.map((e) => Number(e.avg_percentage || 0))) : 0;

  const W = 920;
  const H = 220;
  const padL = 44;
  const padR = 86;
  const padT = 26;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const yFor = (pct: number) => padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;
  const step = plotW / Math.max(1, items.length);
  const barW = Math.min(44, Math.max(20, step * 0.34));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="pt-chart-svg"
      role="img"
      aria-label="Average score by examination"
    >
      {/* Horizontal gridlines at 0, 25, 50, 75, 100 */}
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = yFor(tick);
        const isPass = tick === 50;
        return (
          <g key={tick}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke="var(--pt-line-2)"
              strokeWidth={isPass ? 1 : 0.75}
              strokeDasharray={isPass ? "4 4" : undefined}
            />
            <text
              x={padL - 8}
              y={y + 3.5}
              textAnchor="end"
              fill="var(--pt-ink-3)"
              fontSize="10.5"
              fontFamily="var(--pt-font-mono)"
            >
              {tick}%
            </text>
          </g>
        );
      })}

      {/* 50% pass benchmark label */}
      <text
        x={padL + 4}
        y={yFor(50) - 5}
        fill="var(--pt-ink-3)"
        fontSize="10"
        fontFamily="var(--pt-font-mono)"
      >
        50% pass
      </text>

      {/* Class average reference line */}
      {overallAvg > 0 ? (
        <g>
          <line
            x1={padL}
            y1={yFor(overallAvg)}
            x2={W - padR}
            y2={yFor(overallAvg)}
            stroke="var(--pt-ink-2)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={W - padR + 6}
            y={yFor(overallAvg) + 3.5}
            fill="var(--pt-ink-2)"
            fontSize="10"
            fontFamily="var(--pt-font-mono)"
          >
            Avg {overallAvg}%
          </text>
        </g>
      ) : null}

      {/* Bars */}
      {items.map((ex, i) => {
        const val = ex.avg_percentage !== null ? Number(ex.avg_percentage) : 0;
        const cx = padL + step * i + step / 2;
        const x = cx - barW / 2;
        const y = yFor(val);
        const h = Math.max(0, yFor(0) - y);
        const isPeak = maxVal > 0 && val === maxVal;
        return (
          <g key={ex.local_id}>
            {h > 0 ? (
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={4}
                fill={isPeak ? "var(--pt-ink)" : "var(--pt-ink-3)"}
                opacity={isPeak ? 0.92 : 0.62}
              />
            ) : null}
            <text
              x={cx}
              y={Math.max(14, y - 6)}
              textAnchor="middle"
              fill={isPeak ? "var(--pt-ink)" : "var(--pt-ink-2)"}
              fontSize="11"
              fontWeight={isPeak ? "600" : "500"}
              fontFamily="var(--pt-font-mono)"
            >
              {val > 0 ? `${val.toFixed(1)}%` : "0%"}
            </text>
            <text
              x={cx}
              y={H - 14}
              textAnchor="middle"
              fill="var(--pt-ink-2)"
              fontSize="10.5"
              fontFamily="var(--pt-font-sans)"
            >
              {truncateLabel(ex.name, items.length > 5 ? 14 : 20)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
