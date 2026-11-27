"use client";

import React, { useState } from "react";

function safeEvaluate(expr: string, degMode: boolean): string {
  const cleaned = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, String(Math.PI))
    .replace(/\be\b/g, String(Math.E))
    .replace(/√\(/g, "Math.sqrt(")
    .replace(/\^/g, "**");

  if (!/^[0-9+\-*/().,\sA-Za-z_*]+$/.test(cleaned)) {
    return "Error";
  }

  const trigFactor = degMode ? Math.PI / 180 : 1;
  const scope = {
    sin: (x: number) => Math.sin(x * trigFactor),
    cos: (x: number) => Math.cos(x * trigFactor),
    tan: (x: number) => Math.tan(x * trigFactor),
    log: (x: number) => Math.log10(x),
    ln: (x: number) => Math.log(x),
    sqrt: (x: number) => Math.sqrt(x),
    abs: (x: number) => Math.abs(x),
  };

  try {
    const fn = new Function(
      "sin",
      "cos",
      "tan",
      "log",
      "ln",
      "sqrt",
      "abs",
      `"use strict"; return (${cleaned});`
    );
    const val = fn(
      scope.sin,
      scope.cos,
      scope.tan,
      scope.log,
      scope.ln,
      scope.sqrt,
      scope.abs
    );
    if (typeof val !== "number" || !Number.isFinite(val)) return "Error";
    return String(Number(val.toPrecision(12)));
  } catch {
    return "Error";
  }
}

export function ScientificCalculator({
  mode,
  onClose,
}: {
  mode: "basic" | "scientific";
  onClose: () => void;
}) {
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");
  const [deg, setDeg] = useState(true);

  function append(tok: string) {
    setExpr((prev) => {
      const next = prev + tok;
      setDisplay(next);
      return next;
    });
  }

  function clearAll() {
    setExpr("");
    setDisplay("0");
  }

  function backspace() {
    setExpr((prev) => {
      const next = prev.slice(0, -1);
      setDisplay(next || "0");
      return next;
    });
  }

  function evaluate() {
    if (!expr.trim()) return;
    const res = safeEvaluate(expr, deg);
    setDisplay(res);
    setExpr(res === "Error" ? "" : res);
  }

  const sciKeys = [
    { label: "sin", tok: "sin(" },
    { label: "cos", tok: "cos(" },
    { label: "tan", tok: "tan(" },
    { label: "√", tok: "sqrt(" },
    { label: "log", tok: "log(" },
    { label: "ln", tok: "ln(" },
    { label: "π", tok: "π" },
    { label: "x^y", tok: "^" },
  ];

  const baseKeys = [
    { label: "(", tok: "(" },
    { label: ")", tok: ")" },
    { label: "⌫", action: backspace },
    { label: "C", action: clearAll },
    { label: "7", tok: "7" },
    { label: "8", tok: "8" },
    { label: "9", tok: "9" },
    { label: "÷", tok: "÷" },
    { label: "4", tok: "4" },
    { label: "5", tok: "5" },
    { label: "6", tok: "6" },
    { label: "×", tok: "×" },
    { label: "1", tok: "1" },
    { label: "2", tok: "2" },
    { label: "3", tok: "3" },
    { label: "-", tok: "-" },
    { label: "0", tok: "0" },
    { label: ".", tok: "." },
    { label: "=", action: evaluate, eq: true },
    { label: "+", tok: "+" },
  ];

  return (
    <div className="pt-calc-wrap" role="dialog" aria-label="Exam Calculator">
      <div className="pt-calc-head">
        <span>{mode === "scientific" ? "Scientific Calculator" : "Calculator"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {mode === "scientific" ? (
            <button
              type="button"
              onClick={() => setDeg((v) => !v)}
              style={{
                border: "1px solid #3c3933",
                background: "#22201d",
                color: "#f7f6f2",
                borderRadius: 6,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {deg ? "DEG" : "RAD"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close calculator"
            style={{
              border: "none",
              background: "transparent",
              color: "#d4d0c8",
              fontSize: 16,
              lineHeight: 1,
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="pt-calc-screen">
        <div className="pt-calc-expr">{expr || " "}</div>
        <div className="pt-calc-val">{display}</div>
      </div>

      {mode === "scientific" ? (
        <div className="pt-calc-grid" style={{ marginBottom: 6 }}>
          {sciKeys.map((k) => (
            <button
              key={k.label}
              type="button"
              className="pt-calc-key"
              onClick={() => append(k.tok)}
            >
              {k.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="pt-calc-grid">
        {baseKeys.map((k) => (
          <button
            key={k.label}
            type="button"
            className={`pt-calc-key ${k.eq ? "pt-calc-key--eq" : ""}`}
            onClick={() => (k.action ? k.action() : append(k.tok || ""))}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
