"use client";

import React, { useMemo, useRef, useState } from "react";
import { CtIco } from "./CtIco";

function evaluateExpression(raw: string): string {
  const expr = raw
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "Math.PI")
    .replace(/\be\b/g, "Math.E")
    .replace(/√\(/g, "Math.sqrt(")
    .replace(/\bsin\(/g, "Math.sin((Math.PI/180)*")
    .replace(/\bcos\(/g, "Math.cos((Math.PI/180)*")
    .replace(/\btan\(/g, "Math.tan((Math.PI/180)*")
    .replace(/\blog\(/g, "Math.log10(")
    .replace(/\bln\(/g, "Math.log(")
    .replace(/\^/g, "**");

  if (!/^[0-9+\-*/().,\sMathPIEsqrtincotag10*]+$/.test(expr)) {
    throw new Error("Invalid expression");
  }
  // Balance unclosed parens
  const openCount = (expr.match(/\(/g) || []).length;
  const closeCount = (expr.match(/\)/g) || []).length;
  const balanced = openCount > closeCount ? expr + ")".repeat(openCount - closeCount) : expr;

  // eslint-disable-next-line no-new-func
  const val = Function(`"use strict"; return (${balanced});`)();
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new Error("Math Error");
  }
  return Number(val.toPrecision(10)).toString();
}

export function OfflineCalc({
  mode,
  open,
  onClose,
}: {
  mode: "basic" | "scientific";
  open: boolean;
  onClose: () => void;
}) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("0");
  const [compact, setCompact] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const preview = useMemo(() => {
    if (!expr.trim()) return "";
    try {
      const val = evaluateExpression(expr);
      return val === expr ? "" : `= ${val}`;
    } catch {
      return "";
    }
  }, [expr]);

  const append = (tok: string) => {
    setExpr((prev) => prev + tok);
  };

  const clearAll = () => {
    setExpr("");
    setResult("0");
  };

  const backspace = () => {
    setExpr((prev) => prev.slice(0, -1));
  };

  const toggleSign = () => {
    setExpr((prev) => {
      if (!prev) return "-";
      if (prev.startsWith("-")) return prev.slice(1);
      return `-${prev}`;
    });
  };

  const compute = () => {
    if (!expr.trim()) return;
    try {
      const out = evaluateExpression(expr);
      setResult(out);
      setExpr(out);
    } catch {
      setResult("Error");
    }
  };

  const onHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const modal = e.currentTarget.parentElement;
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const nx = Math.max(8, Math.min(window.innerWidth - rect.width - 8, ev.clientX - dragRef.current.dx));
      const ny = Math.max(8, Math.min(window.innerHeight - 80, ev.clientY - dragRef.current.dy));
      setPos({ x: nx, y: ny });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (!open) return null;

  const isSci = mode === "scientific";

  return (
    <div
      id="calculatorModal"
      className={`calculator-modal show${compact ? " compact" : ""}`}
      style={
        pos
          ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", transform: "none" }
          : { top: 108, right: 28, left: "auto", bottom: "auto" }
      }
    >
      <div className="calculator-header" id="calculatorHeader" onMouseDown={onHeaderMouseDown}>
        <div className="calc-header-title">
          <CtIco name="i-calculator" className="ct-ico--sm" />
          <span>{isSci ? "Scientific Calculator" : "Calculator"}</span>
        </div>
        <div className="calc-header-actions">
          <button
            type="button"
            className="calc-tool-btn"
            id="calcSizeToggle"
            title="Toggle Compact / Standard"
            onClick={() => setCompact((v) => !v)}
          >
            <CtIco name="i-sliders" className="ct-ico--xs" />
          </button>
          <button type="button" className="calculator-close" onClick={onClose} title="Close">
            <CtIco name="i-x" className="ct-ico--xs" />
          </button>
        </div>
      </div>

      <div className="calculator-display">
        <div className="calculator-expression" id="calcExpression">{expr || "0"}</div>
        <div className="calculator-preview" id="calcPreview">{preview}</div>
        <div className="calculator-result" id="calcResult">{result}</div>
      </div>

      <div
        id="calculatorButtons"
        style={{
          display: "grid",
          gridTemplateColumns: isSci ? "repeat(5, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
          gap: 6,
          padding: 12,
        }}
      >
        {isSci && (
          <>
            <button type="button" className="calc-btn scientific" onClick={() => append("sin(")}>sin</button>
            <button type="button" className="calc-btn scientific" onClick={() => append("cos(")}>cos</button>
            <button type="button" className="calc-btn scientific" onClick={() => append("tan(")}>tan</button>
            <button type="button" className="calc-btn scientific" onClick={() => append("log(")}>log</button>
            <button type="button" className="calc-btn scientific" onClick={() => append("ln(")}>ln</button>

            <button type="button" className="calc-btn scientific" onClick={() => append("√(")}>√</button>
            <button type="button" className="calc-btn scientific" onClick={() => append("^")}>x^y</button>
            <button type="button" className="calc-btn scientific" onClick={() => append("π")}>π</button>
            <button type="button" className="calc-btn paren" onClick={() => append("(")}>(</button>
            <button type="button" className="calc-btn paren" onClick={() => append(")")}>)</button>
          </>
        )}

        <button type="button" className="calc-btn clear" onClick={clearAll}>C</button>
        <button type="button" className="calc-btn backspace" onClick={backspace}>⌫</button>
        <button type="button" className="calc-btn sign" onClick={toggleSign}>±</button>
        <button type="button" className="calc-btn operator" onClick={() => append("÷")}>÷</button>
        {isSci && <button type="button" className="calc-btn scientific" onClick={() => append("^2")}>x²</button>}

        <button type="button" className="calc-btn num" onClick={() => append("7")}>7</button>
        <button type="button" className="calc-btn num" onClick={() => append("8")}>8</button>
        <button type="button" className="calc-btn num" onClick={() => append("9")}>9</button>
        <button type="button" className="calc-btn operator" onClick={() => append("×")}>×</button>
        {isSci && <button type="button" className="calc-btn scientific" onClick={() => append("1/")}>1/x</button>}

        <button type="button" className="calc-btn num" onClick={() => append("4")}>4</button>
        <button type="button" className="calc-btn num" onClick={() => append("5")}>5</button>
        <button type="button" className="calc-btn num" onClick={() => append("6")}>6</button>
        <button type="button" className="calc-btn operator" onClick={() => append("-")}>-</button>
        {isSci && <button type="button" className="calc-btn scientific" onClick={() => append("e")}>e</button>}

        <button type="button" className="calc-btn num" onClick={() => append("1")}>1</button>
        <button type="button" className="calc-btn num" onClick={() => append("2")}>2</button>
        <button type="button" className="calc-btn num" onClick={() => append("3")}>3</button>
        <button type="button" className="calc-btn operator" onClick={() => append("+")}>+</button>
        {isSci && <button type="button" className="calc-btn operator" onClick={() => append("/100")}>%</button>}

        <button type="button" className="calc-btn num" style={{ gridColumn: "span 2" }} onClick={() => append("0")}>0</button>
        <button type="button" className="calc-btn decimal" onClick={() => append(".")}>.</button>
        <button type="button" className="calc-btn equals" style={isSci ? { gridColumn: "span 2" } : undefined} onClick={compute}>=</button>
      </div>
    </div>
  );
}
