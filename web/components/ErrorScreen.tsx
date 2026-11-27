"use client";

import React, { useEffect, useState } from "react";
import { CogniTaraMark, CogniTaraWordmark } from "./CogniTaraLogo";

export interface ErrorScreenProps {
  code: 404 | 500 | 403;
  statusLabel?: string;
  title?: string;
  description?: string;
  digest?: string;
  onReset?: () => void;
}

const DEFAULTS: Record<
  404 | 500 | 403,
  { statusLabel: string; title: string; description: string }
> = {
  404: {
    statusLabel: "Page not found",
    title: "This page does not exist",
    description:
      "The address may have moved, expired, or been mistyped. Check the URL or continue from one of the working sections below.",
  },
  500: {
    statusLabel: "Server error",
    title: "Something went wrong on our side",
    description:
      "An unexpected error interrupted this request. Your saved data and examination records remain intact. Try reloading or return to the portal.",
  },
  403: {
    statusLabel: "Access restricted",
    title: "You do not have access to this page",
    description:
      "Your current account role cannot open this route. Sign in with an authorized account or return to your workspace.",
  },
};

export function ErrorScreen({
  code,
  statusLabel,
  title,
  description,
  digest,
  onReset,
}: ErrorScreenProps) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isPortalHost, setIsPortalHost] = useState(false);
  const [pathname, setPathname] = useState("");
  const [retrying, setRetrying] = useState(false);

  const meta = DEFAULTS[code] || DEFAULTS[500];
  const resolvedLabel = statusLabel || meta.statusLabel;
  const resolvedTitle = title || meta.title;
  const resolvedDesc = description || meta.description;

  useEffect(() => {
    try {
      const host = window.location.hostname.toLowerCase();
      setIsPortalHost(host.startsWith("portal."));
      setPathname(window.location.pathname || "/");

      const currentAttr = document.documentElement.getAttribute("data-theme");
      const saved =
        localStorage.getItem("ct-portal-theme") ||
        localStorage.getItem("ct-cloud-theme") ||
        currentAttr ||
        "light";
      const nextTheme = saved === "dark" ? "dark" : "light";
      setTheme(nextTheme);
      document.documentElement.setAttribute("data-theme", nextTheme);
    } catch {}
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "h" || e.key === "H") {
        window.location.href = "/";
      } else if (e.key === "r" || e.key === "R") {
        if (onReset) {
          onReset();
        } else {
          window.location.reload();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onReset]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("ct-portal-theme", next);
      localStorage.setItem("ct-cloud-theme", next);
    } catch {}
  }

  function handleRetry() {
    setRetrying(true);
    if (onReset) {
      try {
        onReset();
      } catch {
        window.location.reload();
      }
      setTimeout(() => setRetrying(false), 1200);
      return;
    }
    window.location.reload();
  }

  function handleGoBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = "/";
    }
  }

  const primaryHref = "/";
  const primaryLabel = isPortalHost ? "Back to Online Portal" : "Return to Home";
  const rightMeta = digest
    ? `REF ${digest.slice(0, 12).toUpperCase()}`
    : pathname || "/";

  return (
    <div className="ct-err-root">
      <style>{ERROR_SCREEN_CSS}</style>

      <header className="ct-err-nav">
        <a href="/" className="ct-err-brand" aria-label="CogniTara Home">
          <CogniTaraMark size={20} />
          <CogniTaraWordmark height={14} />
          <span className="ct-err-brand__sep" aria-hidden="true" />
          <span className="ct-err-brand__scope">
            {isPortalHost ? "Online Exam Portal" : "CogniTara Cloud"}
          </span>
        </a>

        <button
          type="button"
          className="ct-err-icon-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
            </svg>
          )}
        </button>
      </header>

      <main id="main-content" className="ct-err-stage">
        <section className="ct-err-card" aria-labelledby="ct-err-heading">
          <div className="ct-err-card__head">
            <div className="ct-err-status-row">
              <span className="ct-err-code-tag">{code}</span>
              <span className="ct-err-status-txt">
                <span className={`ct-err-dot ${code >= 500 ? "is-alert" : ""}`} />
                {resolvedLabel}
              </span>
            </div>
            <span className="ct-err-path" title={rightMeta}>
              {rightMeta}
            </span>
          </div>

          <div className="ct-err-card__body">
            <div className="ct-err-numeral" aria-hidden="true">
              {code}
            </div>
            <h1 id="ct-err-heading" className="ct-err-title">
              {resolvedTitle}
            </h1>
            <p className="ct-err-desc">{resolvedDesc}</p>

            <div className="ct-err-actions">
              {code === 500 ? (
                <>
                  <button
                    type="button"
                    className="ct-err-btn ct-err-btn--primary"
                    onClick={handleRetry}
                    disabled={retrying}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                      <path d="M21 3v6h-6" />
                    </svg>
                    <span>{retrying ? "Retrying..." : "Try Again"}</span>
                  </button>
                  <a href={primaryHref} className="ct-err-btn">
                    <span>{primaryLabel}</span>
                  </a>
                </>
              ) : (
                <>
                  <a href={primaryHref} className="ct-err-btn ct-err-btn--primary">
                    <span>{primaryLabel}</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </a>
                  {isPortalHost ? (
                    <button type="button" className="ct-err-btn" onClick={handleGoBack}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M11 6l-6 6 6 6" />
                      </svg>
                      <span>Go Back</span>
                    </button>
                  ) : (
                    <a href="https://portal.cognitara.net" className="ct-err-btn">
                      <span>Open Exam Portal</span>
                    </a>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="ct-err-card__foot">
            {isPortalHost ? (
              <>
                <a href="/">School ID Gateway</a>
                <a href="/admin">Admin Portal</a>
                <a href="https://cognitara.net/support">Support</a>
              </>
            ) : (
              <>
                <a href="/">Home</a>
                <a href="https://portal.cognitara.net">Online Portal</a>
                <a href="/license">Licensing</a>
                <a href="/support">Support</a>
              </>
            )}
          </div>
        </section>

        <div className="ct-err-kbd-hint" aria-hidden="true">
          <span>
            Press <kbd>H</kbd> for home
          </span>
          <span>
            Press <kbd>R</kbd> to reload
          </span>
        </div>
      </main>
    </div>
  );
}

const ERROR_SCREEN_CSS = `
.ct-err-root {
  --er-bg: #f8f8f8;
  --er-surface: #ffffff;
  --er-well: #f2f1ee;
  --er-foot: #f6f5f2;
  --er-line: #e5e3dd;
  --er-line-strong: #d4d1c9;
  --er-ink: #171614;
  --er-ink-2: #575551;
  --er-ink-3: #838079;
  --er-btn-bg: #171614;
  --er-btn-ink: #ffffff;
  --er-btn-hover: #2c2a26;
  --er-shadow: 0 1px 2px rgba(23, 22, 20, 0.04), 0 12px 32px rgba(23, 22, 20, 0.05);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--er-bg);
  color: var(--er-ink);
  font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

[data-theme="dark"] .ct-err-root,
.ct-err-root[data-theme="dark"] {
  --er-bg: #151517;
  --er-surface: #1b1b1e;
  --er-well: #111112;
  --er-foot: #141416;
  --er-line: #2a2a2e;
  --er-line-strong: #3a3a40;
  --er-ink: #f5f5f4;
  --er-ink-2: #a8a6a1;
  --er-ink-3: #767470;
  --er-btn-bg: #f5f5f4;
  --er-btn-ink: #151517;
  --er-btn-hover: #ffffff;
  --er-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 16px 36px rgba(0, 0, 0, 0.32);
}

.ct-err-root *,
.ct-err-root *::before,
.ct-err-root *::after {
  box-sizing: border-box;
}

.ct-err-nav {
  height: 56px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--er-line);
  background: var(--er-surface);
}

.ct-err-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--er-ink);
  text-decoration: none;
  min-width: 0;
}

.ct-err-brand__sep {
  width: 1px;
  height: 16px;
  background: var(--er-line-strong);
  margin: 0 4px;
}

.ct-err-brand__scope {
  font-size: 13px;
  font-weight: 500;
  color: var(--er-ink-2);
  white-space: nowrap;
}

.ct-err-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--er-line);
  background: var(--er-surface);
  color: var(--er-ink-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}

.ct-err-icon-btn:hover {
  background: var(--er-well);
  border-color: var(--er-line-strong);
  color: var(--er-ink);
}

.ct-err-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px 48px;
  gap: 16px;
}

.ct-err-card {
  width: 100%;
  max-width: 520px;
  background: var(--er-surface);
  border: 1px solid var(--er-line);
  border-radius: 14px;
  box-shadow: var(--er-shadow);
  overflow: hidden;
}

.ct-err-card__head {
  padding: 14px 24px;
  border-bottom: 1px solid var(--er-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ct-err-status-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ct-err-code-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 7px;
  border-radius: 4px;
  background: var(--er-well);
  border: 1px solid var(--er-line);
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--er-ink);
}

.ct-err-status-txt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--er-ink-2);
}

.ct-err-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--er-ink-3);
  flex-shrink: 0;
}

.ct-err-dot.is-alert {
  background: var(--er-ink);
}

.ct-err-path {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: var(--er-ink-3);
  max-width: 210px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ct-err-card__body {
  padding: 32px 24px 28px;
}

.ct-err-numeral {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 56px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--er-ink);
  margin-bottom: 18px;
}

.ct-err-title {
  margin: 0 0 10px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: var(--er-ink);
}

.ct-err-desc {
  margin: 0 0 24px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--er-ink-2);
}

.ct-err-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ct-err-btn {
  height: 40px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid var(--er-line-strong);
  background: var(--er-surface);
  color: var(--er-ink);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 500;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, opacity 140ms ease;
}

.ct-err-btn:hover {
  background: var(--er-well);
}

.ct-err-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.ct-err-btn--primary {
  background: var(--er-btn-bg);
  color: var(--er-btn-ink);
  border-color: var(--er-btn-bg);
}

.ct-err-btn--primary:hover {
  background: var(--er-btn-hover);
  border-color: var(--er-btn-hover);
}

.ct-err-card__foot {
  padding: 13px 24px;
  border-top: 1px solid var(--er-line);
  background: var(--er-foot);
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.ct-err-card__foot a {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--er-ink-2);
  text-decoration: none;
}

.ct-err-card__foot a:hover {
  color: var(--er-ink);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.ct-err-kbd-hint {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  font-size: 12px;
  color: var(--er-ink-3);
}

.ct-err-kbd-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  margin: 0 3px;
  border-radius: 4px;
  border: 1px solid var(--er-line-strong);
  background: var(--er-surface);
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--er-ink-2);
}

@media (max-width: 560px) {
  .ct-err-nav {
    padding: 0 16px;
  }
  .ct-err-brand__sep,
  .ct-err-brand__scope {
    display: none;
  }
  .ct-err-card__head {
    padding: 12px 18px;
  }
  .ct-err-path {
    max-width: 120px;
  }
  .ct-err-card__body {
    padding: 24px 18px 22px;
  }
  .ct-err-numeral {
    font-size: 46px;
  }
  .ct-err-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .ct-err-btn {
    width: 100%;
  }
  .ct-err-card__foot {
    padding: 12px 18px;
    gap: 14px;
  }
  .ct-err-kbd-hint {
    display: none;
  }
}
`;
