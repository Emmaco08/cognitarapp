"use client";

import React from "react";

const MONO_SHADES = [
  "var(--ct-ink)",
  "var(--ct-ink-2)",
  "color-mix(in srgb, var(--ct-ink) 52%, transparent)",
  "color-mix(in srgb, var(--ct-ink) 32%, transparent)",
  "color-mix(in srgb, var(--ct-ink) 16%, transparent)",
];

export function MonochromeBarChart({
  data,
  maxVal = 100,
  unit = "%",
  height = 220,
}: {
  data: Array<{ label: string; value: number; sub?: string }>;
  maxVal?: number;
  unit?: string;
  height?: number;
}) {
  if (!data.length) {
    return (
      <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--ct-ink-3)", fontSize: 13 }}>
        No data recorded yet
      </div>
    );
  }
  const peak = Math.max(maxVal, ...data.map((d) => Number(d.value || 0)), 1);
  const w = Math.max(760, data.length * 124);
  const padL = 42;
  const padR = 16;
  const padB = 34;
  const padT = 24;
  const plotH = height - padT - padB;
  const barSlot = (w - padL - padR) / data.length;
  const barW = Math.min(46, Math.max(20, barSlot * 0.36));
  const nonZero = data.filter((d) => Number(d.value || 0) > 0);
  const meanVal = nonZero.length
    ? Math.round((nonZero.reduce((s, d) => s + Number(d.value || 0), 0) / nonZero.length) * 10) / 10
    : 0;
  const passY = padT + plotH - (50 / peak) * plotH;
  const avgY = padT + plotH - (meanVal / peak) * plotH;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        className="ct-svg-chart"
        viewBox={`0 0 ${w} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "auto", minHeight: height, maxHeight: height + 30 }}
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const val = Math.round((tick / 100) * peak);
          const y = padT + plotH - (tick / 100) * plotH;
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="var(--ct-border)" strokeWidth="1" />
              <text x={padL - 8} y={y + 3.5} textAnchor="end" fontSize="10.5" fill="var(--ct-ink-3)" fontFamily="var(--ct-mono)">
                {val}{unit === "%" ? "%" : ""}
              </text>
            </g>
          );
        })}
        {unit === "%" && peak >= 50 && (
          <g>
            <line x1={padL} y1={passY} x2={w - padR} y2={passY} stroke="var(--ct-ink-3)" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
            <text x={padL + 6} y={passY - 5} fontSize="9.5" fontWeight="600" fill="var(--ct-ink-3)" fontFamily="var(--ct-mono)">
              50% PASS
            </text>
          </g>
        )}
        {unit === "%" && meanVal > 0 && Math.abs(meanVal - 50) > 6 && (
          <g>
            <line x1={padL} y1={avgY} x2={w - padR} y2={avgY} stroke="var(--ct-ink-2)" strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
            <text x={w - padR - 4} y={avgY - 5} textAnchor="end" fontSize="9.5" fontWeight="600" fill="var(--ct-ink-2)" fontFamily="var(--ct-mono)">
              AVG {meanVal}%
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const val = Math.max(0, Number(d.value || 0));
          const bh = val > 0 ? Math.max(3, (val / peak) * plotH) : 0;
          const x = padL + i * barSlot + (barSlot - barW) / 2;
          const y = padT + plotH - bh;
          const maxChars = Math.max(12, Math.floor(barSlot / 7.2));
          const shortLabel = d.label.length > maxChars ? `${d.label.slice(0, maxChars - 2)}...` : d.label;
          return (
            <g key={`${d.label}-${i}`}>
              <title>{`${d.label}: ${val}${unit}${d.sub ? ` (${d.sub})` : ""}`}</title>
              {bh > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={bh}
                  rx="4"
                  fill={val >= 70 ? "var(--ct-ink)" : "var(--ct-ink-2)"}
                  opacity={val >= 70 ? 0.88 : 0.72}
                />
              )}
              <text x={x + barW / 2} y={Math.max(12, y - 7)} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ct-ink)" fontFamily="var(--ct-mono)">
                {val}{unit}
              </text>
              <text x={x + barW / 2} y={height - 10} textAnchor="middle" fontSize="10.5" fill="var(--ct-ink-2)">
                {shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function MonochromeHBarChart({
  data,
  maxVal = 100,
  unit = "%",
}: {
  data: Array<{ label: string; value: number; meta?: string }>;
  maxVal?: number;
  unit?: string;
}) {
  if (!data.length) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ct-ink-3)", fontSize: 13 }}>
        No performance data recorded yet
      </div>
    );
  }
  const peak = Math.max(maxVal, ...data.map((d) => Number(d.value || 0)), 1);
  return (
    <div style={{ display: "grid", gap: 11 }}>
      {data.map((row, idx) => {
        const pct = Math.max(0, Math.min(100, (Number(row.value || 0) / peak) * 100));
        return (
          <div key={`${row.label}-${idx}`} style={{ display: "grid", gap: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 12.5 }}>
              <span style={{ fontWeight: 600, color: "var(--ct-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.label}
              </span>
              <span style={{ fontFamily: "var(--ct-mono)", fontSize: 12, color: "var(--ct-ink-2)", flex: "none" }}>
                {row.value}{unit}{row.meta ? ` · ${row.meta}` : ""}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--ct-surface-2)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: "var(--ct-ink)", transition: "width .35s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MonochromeDonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 180,
}: {
  segments: Array<{ label: string; value: number }>;
  centerLabel?: string;
  centerValue?: string | number;
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, Number(s.value || 0)), 0);
  if (total === 0) {
    return (
      <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--ct-ink-3)", fontSize: 13 }}>
        No graded scripts yet
      </div>
    );
  }
  const r = 64;
  const cx = 90;
  const cy = 90;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox="0 0 180 180" style={{ flex: "none" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ct-surface-2)" strokeWidth="20" />
        {segments.map((seg, i) => {
          const val = Math.max(0, Number(seg.value || 0));
          if (!val) return null;
          const dash = (val / total) * circ;
          const dashOffset = -offset;
          offset += dash;
          return (
            <circle
              key={seg.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={MONO_SHADES[i % MONO_SHADES.length]}
              strokeWidth="20"
              strokeDasharray={`${Math.max(0, dash - 1.5)} ${circ}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${cx} ${cy})`}
            >
              <title>{`${seg.label}: ${val} (${Math.round((val / total) * 100)}%)`}</title>
            </circle>
          );
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="22" fontWeight="750" fill="var(--ct-ink)" fontFamily="var(--ct-mono)">
          {centerValue ?? total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10.5" fill="var(--ct-ink-3)">
          {centerLabel || "Graded"}
        </text>
      </svg>

      <div className="ct-chart-legend" style={{ flexDirection: "column", gap: 7, marginTop: 0 }}>
        {segments.map((seg, i) => {
          const pct = Math.round((Math.max(0, Number(seg.value || 0)) / total) * 100);
          return (
            <div key={seg.label} className="ct-chart-legend__item" style={{ justifyContent: "space-between", minWidth: 138 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <i className="ct-chart-legend__swatch" style={{ background: MONO_SHADES[i % MONO_SHADES.length] }} />
                <strong style={{ color: "var(--ct-ink)", fontWeight: 600 }}>{seg.label}</strong>
              </span>
              <span style={{ fontFamily: "var(--ct-mono)", color: "var(--ct-ink-2)" }}>
                {seg.value} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonochromeLineChart({
  points,
  height = 200,
}: {
  points: Array<{ label: string; value: number }>;
  height?: number;
}) {
  if (!points.length) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ct-ink-3)", fontSize: 13 }}>
        No score history recorded yet
      </div>
    );
  }
  const w = Math.max(360, points.length * 76);
  const padL = 34;
  const padR = 20;
  const padT = 20;
  const padB = 34;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const val = Math.max(0, Math.min(100, Number(p.value || 0)));
    return {
      x: points.length > 1 ? padL + i * stepX : padL + plotW / 2,
      y: padT + plotH - (val / 100) * plotH,
      val,
      label: p.label,
    };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x} ${padT + plotH} L ${coords[0].x} ${padT + plotH} Z`
      : "";

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg className="ct-svg-chart" viewBox={`0 0 ${w} ${height}`} style={{ minWidth: Math.min(w, 320), height }}>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padT + plotH - (tick / 100) * plotH;
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="var(--ct-border)" strokeWidth="1" />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--ct-ink-3)" fontFamily="var(--ct-mono)">
                {tick}%
              </text>
            </g>
          );
        })}
        {areaPath && <path d={areaPath} fill="var(--ct-ink)" opacity={0.07} />}
        {coords.length > 1 && <path d={linePath} fill="none" stroke="var(--ct-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
        {coords.map((c, i) => {
          const short = c.label.length > 12 ? `${c.label.slice(0, 11)}...` : c.label;
          return (
            <g key={`${c.label}-${i}`}>
              <title>{`${c.label}: ${c.val}%`}</title>
              <circle cx={c.x} cy={c.y} r="4.5" fill="var(--ct-surface)" stroke="var(--ct-ink)" strokeWidth="2.2" />
              <text x={c.x} y={c.y - 10} textAnchor="middle" fontSize="10.5" fontWeight="650" fill="var(--ct-ink)" fontFamily="var(--ct-mono)">
                {c.val}%
              </text>
              <text x={c.x} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--ct-ink-2)">
                {short}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
