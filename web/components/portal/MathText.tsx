"use client";

import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    katex?: {
      renderToString: (expr: string, opts?: Record<string, unknown>) => string;
    };
    __ctKatexPromise?: Promise<boolean>;
  }
}

function loadStaticKatex(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.katex) return Promise.resolve(true);
  if (window.__ctKatexPromise) return window.__ctKatexPromise;

  window.__ctKatexPromise = new Promise<boolean>((resolve) => {
    if (!document.getElementById("ct-katex-css")) {
      const link = document.createElement("link");
      link.id = "ct-katex-css";
      link.rel = "stylesheet";
      link.href = "/katex/katex.min.css";
      document.head.appendChild(link);
    }

    const loadScript = (src: string, id: string) =>
      new Promise<boolean>((res) => {
        if (document.getElementById(id)) {
          res(true);
          return;
        }
        const s = document.createElement("script");
        s.id = id;
        s.src = src;
        s.async = true;
        s.onload = () => res(true);
        s.onerror = () => res(false);
        document.head.appendChild(s);
      });

    loadScript("/katex/katex.min.js", "ct-katex-js")
      .then((ok) => {
        if (!ok) return false;
        return loadScript("/katex/contrib/mhchem.min.js", "ct-katex-mhchem");
      })
      .then(() => resolve(Boolean(window.katex)))
      .catch(() => resolve(false));
  });

  return window.__ctKatexPromise;
}

function hasMathSyntax(text: string): boolean {
  return /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/.test(text);
}

/**
 * Strips dangerous tags/attributes from synced HTML snippets while preserving
 * benign formatting tags (span, sup, sub, b, strong, i, em, u, br, p, table, img data/https).
 */
function sanitizeRichText(raw: string): string {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(iframe|object|embed|input)[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function decodeHtmlEntitiesForMath(expr: string): string {
  return expr
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function renderWithKatex(html: string): string {
  const katex = typeof window !== "undefined" ? window.katex : undefined;
  if (!katex) return html;

  const renderExpr = (expr: string, displayMode: boolean) => {
    try {
      return katex.renderToString(decodeHtmlEntitiesForMath(expr.trim()), {
        displayMode,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return expr;
    }
  };

  let out = html;
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => renderExpr(m, true));
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => renderExpr(m, true));
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => renderExpr(m, false));
  out = out.replace(/\$([^$\n]+?)\$/g, (_, m) => renderExpr(m, false));
  return out;
}

export function MathText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const safe = sanitizeRichText(text);
  const needsMath = hasMathSyntax(safe);
  const [ready, setReady] = useState<boolean>(() =>
    typeof window !== "undefined" ? Boolean(window.katex) : false
  );

  useEffect(() => {
    if (!needsMath || ready) return;
    let alive = true;
    void loadStaticKatex().then((ok) => {
      if (alive && ok) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [needsMath, ready]);

  const html = needsMath && ready ? renderWithKatex(safe) : safe;

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
