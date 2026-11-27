"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import LandingNav from "../../../components/landing/LandingNav";
import LandingFooter from "../../../components/landing/LandingFooter";

interface ReceiptPayload {
  ok: boolean;
  authenticated?: boolean;
  status: string;
  email_sent?: boolean;
  receipt_token?: string;
  pdf_url?: string;
  error?: string;
  receipt?: {
    reference: string;
    school_name: string;
    owner_name: string;
    email: string;
    plan_name: string;
    plan_slug?: string;
    duration_days?: number | null;
    currency: string;
    original_amount_minor: number;
    discount_amount_minor: number;
    amount_minor: number;
    fee_minor: number;
    customer_paid_minor: number;
    promo_code: string | null;
    channel: string;
    is_test: boolean;
    paid_at: string | null;
    created_at: string;
  };
  license?: {
    id: string;
    license_key: string;
    plan_tier: string;
    status: string;
    issued_at: string;
    expires_at: string | null;
    signed_lease?: Record<string, unknown> | null;
  } | null;
  message?: string;
}

function fmtMoney(minor: number, currency = "NGN") {
  const sym = currency === "USD" ? "$" : currency === "NGN" ? "₦" : `${currency} `;
  const val = Number(minor || 0) / 100;
  return `${sym}${val.toLocaleString(currency === "USD" ? "en-US" : "en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Cryptographic left-to-right slot-decode reveal for Ed25519 Licence Keys.
 * Respects `prefers-reduced-motion: reduce` by returning the exact key immediately.
 */
function useDecodedLicenseKey(realKey: string | undefined): { display: string; settled: boolean } {
  const [display, setDisplay] = useState(realKey || "");
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!realKey) {
      setDisplay("");
      setSettled(false);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplay(realKey);
      setSettled(true);
      return;
    }

    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const chars = realKey.split("");
    const startDelay = 340;
    const decodeDuration = 760;
    const t0 = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - t0 - startDelay;
      if (elapsed < 0) {
        const masked = chars
          .map((ch, idx) => (ch === "-" ? "-" : alphabet[(idx * 7 + Math.floor(now / 45)) % alphabet.length]))
          .join("");
        setDisplay(masked);
        rafId = requestAnimationFrame(tick);
        return;
      }

      const progress = Math.min(1, elapsed / decodeDuration);
      const lockedCount = Math.floor(progress * chars.length);

      const frame = chars
        .map((ch, idx) => {
          if (ch === "-" || idx < lockedCount) return ch;
          return alphabet[(idx * 11 + Math.floor(now / 36)) % alphabet.length];
        })
        .join("");

      setDisplay(frame);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setDisplay(realKey);
        setSettled(true);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [realKey]);

  return { display, settled };
}

/**
 * Architectural monochrome particle burst behind the verified seal.
 * Pure obsidian (#171614), graphite (#575551), and warm silver (#C5C2BA) ribbons & diamonds.
 * Runs once on confirmation and stops automatically so zero idle CPU is consumed.
 */
function MonochromeCelebrationCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 720;
    const height = canvas.clientHeight || 340;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.scale(dpr, dpr);

    const originX = width / 2;
    const originY = 104;
    const palette = ["#171614", "#2E2C29", "#575551", "#8E8B84", "#C9C6BE"];

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      ratio: number;
      angle: number;
      spin: number;
      color: string;
      shape: "diamond" | "ribbon" | "dot";
      alpha: number;
    }

    const particles: Particle[] = [];
    const count = 54;
    for (let i = 0; i < count; i++) {
      const theta = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.24;
      const speed = 2.6 + Math.random() * 5.6;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(theta) * speed * (1.08 + Math.random() * 0.25),
        vy: Math.sin(theta) * speed * 0.82 - (1.8 + Math.random() * 2.2),
        size: 3.5 + Math.random() * 5.2,
        ratio: 0.35 + Math.random() * 0.55,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.16,
        color: palette[i % palette.length],
        shape: i % 3 === 0 ? "diamond" : i % 3 === 1 ? "ribbon" : "dot",
        alpha: 0.92,
      });
    }

    let rafId = 0;
    const start = performance.now();
    const maxDuration = 2800;

    const render = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);

      if (elapsed > maxDuration) return;
      const fadeProgress = Math.max(0, (elapsed - 1250) / (maxDuration - 1250));

      for (const p of particles) {
        p.vx *= 0.968;
        p.vy = p.vy * 0.968 + 0.095;
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        const opacity = Math.max(0, p.alpha * (1 - fadeProgress));
        if (opacity <= 0.01) continue;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = p.color;

        if (p.shape === "diamond") {
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.62, 0);
          ctx.lineTo(0, s);
          ctx.lineTo(-s * 0.62, 0);
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === "ribbon") {
          ctx.fillRect(-p.size, -p.size * p.ratio * 0.45, p.size * 2, Math.max(1.8, p.size * p.ratio));
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.36, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  return <canvas ref={canvasRef} className="rs-done-canvas" aria-hidden="true" />;
}

export default function PaymentDonePage() {
  const [reference, setReference] = useState("");
  const [receiptToken, setReceiptToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReceiptPayload | null>(null);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchReceipt = useCallback(async (ref: string, rt: string) => {
    setLoading(true);
    setError("");
    setErrorCode("");
    try {
      const qs = rt ? `?rt=${encodeURIComponent(rt)}` : "";
      const res = await fetch(`/api/v1/payments/receipt/${encodeURIComponent(ref)}${qs}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as ReceiptPayload;
      if (!res.ok || !json.ok) {
        setError(json.message || "We could not verify this payment reference.");
        setErrorCode(json.error || (res.status === 403 ? "receipt_unauthorized" : "lookup_error"));
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Could not reach our payment verification server right now. Click retry below.");
      setErrorCode("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get("reference") || params.get("trxref") || "").trim();
    const rt = (params.get("rt") || "").trim();
    setReference(ref);
    setReceiptToken(rt);
    if (!ref) {
      setLoading(false);
      setError("No payment reference was provided in this link.");
      setErrorCode("missing_reference");
      return;
    }
    void fetchReceipt(ref, rt);
  }, [fetchReceipt]);

  // Auto-poll while Paystack finishes confirming
  useEffect(() => {
    if (!reference || !data || data.status === "success" || data.status === "failed" || data.status === "refunded") {
      return;
    }
    const timer = setTimeout(() => {
      void fetchReceipt(reference, receiptToken);
    }, 3500);
    return () => clearTimeout(timer);
  }, [reference, receiptToken, data, fetchReceipt]);

  function copyKey(key: string) {
    navigator.clipboard?.writeText(key).catch(() => {});
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  function downloadLicenseFile() {
    if (!data?.license?.signed_lease) return;
    const blob = new Blob([JSON.stringify(data.license.signed_lease, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.license.license_key}.cgnlic`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const r = data?.receipt;
  const lic = data?.license;
  const isPaid = data?.status === "success";
  const isFailed = data?.status === "failed" || data?.status === "refunded";
  const isVoucher = Boolean(r?.channel?.toLowerCase().includes("voucher"));
  const decodedKey = useDecodedLicenseKey(isPaid ? lic?.license_key : undefined);

  const pdfHref =
    data?.pdf_url ||
    (reference
      ? `/api/v1/payments/receipt/${encodeURIComponent(reference)}/pdf${
          data?.receipt_token || receiptToken
            ? `?rt=${encodeURIComponent(data?.receipt_token || receiptToken)}`
            : ""
        }`
      : "");

  return (
    <div className="rs-root">
      <div className="no-print">
        <LandingNav activePath="/license" />
      </div>

      <main id="main-content" className="rs-subpage rs-done-page">
        <div className="rs-done-shell">
          {/* STATE 1: Initial loading */}
          {loading && !data ? (
            <section className="rs-done-state-card">
              <div className="rs-done-radar" aria-hidden="true">
                <span className="rs-done-radar-ring" />
                <span className="rs-done-radar-core" />
              </div>
              <h1 className="rs-done-h1">Verifying your payment</h1>
              <p className="rs-done-lead">
                Confirming transaction authenticity with Paystack and sealing your school&apos;s Ed25519 licence certificate.
              </p>
              {reference ? <code className="rs-done-ref-chip">{reference}</code> : null}
            </section>
          ) : error ? (
            /* STATE 2: Error / 403 Unauthorized */
            <section className="rs-done-state-card">
              <div className="rs-done-icon-circle" aria-hidden="true">
                {errorCode === "receipt_unauthorized" ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16.5h.01" />
                  </svg>
                )}
              </div>
              <h1 className="rs-done-h1">
                {errorCode === "receipt_unauthorized" ? "Protected school receipt" : "Could not load receipt"}
              </h1>
              <p className="rs-done-lead">{error}</p>
              <div className="rs-done-actions no-print">
                {errorCode === "receipt_unauthorized" ? (
                  <Link href="/signin" className="rs-btn rs-btn--primary">
                    Sign in to school account
                  </Link>
                ) : reference ? (
                  <button
                    type="button"
                    className="rs-btn rs-btn--primary"
                    onClick={() => void fetchReceipt(reference, receiptToken)}
                  >
                    Try again
                  </button>
                ) : null}
                <Link href="/license" className="rs-btn rs-btn--soft">
                  View licence plans
                </Link>
              </div>
            </section>
          ) : r ? (
            /* STATE 3: Confirmed / Pending / Failed */
            <>
              {/* ACT 1: Monochrome Kinetic Celebration + Precision Seal */}
              <section className={`rs-done-hero${isPaid ? " is-paid" : ""}`}>
                {isPaid ? <MonochromeCelebrationCanvas active={isPaid} /> : null}

                {isPaid ? (
                  <div className="rs-done-seal" aria-hidden="true">
                    <svg viewBox="0 0 156 156">
                      <circle className="rs-seal-sonar rs-seal-sonar--1" cx="78" cy="78" r="46" />
                      <circle className="rs-seal-sonar rs-seal-sonar--2" cx="78" cy="78" r="46" />
                      <circle className="rs-seal-orbit" cx="78" cy="78" r="60" />
                      <g className="rs-seal-ticks">
                        <line x1="78" y1="10" x2="78" y2="18" />
                        <line x1="126" y1="30" x2="120" y2="36" />
                        <line x1="146" y1="78" x2="138" y2="78" />
                        <line x1="126" y1="126" x2="120" y2="120" />
                        <line x1="78" y1="146" x2="78" y2="138" />
                        <line x1="30" y1="126" x2="36" y2="120" />
                        <line x1="10" y1="78" x2="18" y2="78" />
                        <line x1="30" y1="30" x2="36" y2="36" />
                      </g>
                      <circle className="rs-seal-disc" cx="78" cy="78" r="42" />
                      <circle className="rs-seal-ring" cx="78" cy="78" r="36" pathLength={100} />
                      <path className="rs-seal-check" d="M59 79 L72 92 L98 65" pathLength={100} />
                    </svg>
                  </div>
                ) : isFailed ? (
                  <div className="rs-done-icon-circle" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                      <path d="M7 7l10 10M17 7L7 17" />
                    </svg>
                  </div>
                ) : (
                  <div className="rs-done-radar" aria-hidden="true">
                    <span className="rs-done-radar-ring" />
                    <span className="rs-done-radar-core" />
                  </div>
                )}

                {isPaid ? (
                  <div className="rs-done-badge">
                    <span className="rs-done-badge-dot" aria-hidden="true" />
                    <span>{isVoucher ? "Voucher redeemed · Ed25519 signed" : "Payment verified · Ed25519 signed"}</span>
                  </div>
                ) : null}

                <h1 className="rs-done-h1">
                  {isPaid
                    ? isVoucher
                      ? "Licence activated"
                      : "Payment confirmed"
                    : isFailed
                    ? "Payment not completed"
                    : "Waiting for Paystack confirmation"}
                </h1>

                <p className="rs-done-lead">
                  {isPaid ? (
                    <>
                      <strong>{r.plan_name}</strong> for <strong>{r.school_name}</strong> is ready
                      {r.is_test ? " (Test Mode)" : ""}. Copy your key below or download your official PDF receipt.
                    </>
                  ) : isFailed ? (
                    "Your payment was not completed and no licence was billed. You can return to checkout and try again."
                  ) : (
                    "Paystack is finalizing your transaction. This page refreshes automatically the moment confirmation clears."
                  )}
                </p>

                {isPaid && r.email ? (
                  <div className="rs-done-email-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M22 7l-10 6L2 7" />
                    </svg>
                    <span>
                      {data.email_sent
                        ? `Licence key & PDF receipt emailed to ${r.email}`
                        : `Certificate issued for ${r.email}`}
                    </span>
                  </div>
                ) : null}
              </section>

              {/* ACT 2: Obsidian Ed25519 Licence Certificate Card + Cryptographic Key Slot-Decode */}
              {isPaid && lic ? (
                <section className="rs-done-cert" aria-label="Official school licence key">
                  <div className="rs-done-cert-sheen" aria-hidden="true" />

                  <div className="rs-done-cert-top">
                    <div>
                      <span className="rs-done-cert-eyebrow">Official Ed25519 Licence Key</span>
                      <div className="rs-done-cert-school">{r.school_name}</div>
                    </div>
                    <span className="rs-done-cert-status">ACTIVE</span>
                  </div>

                  <div className="rs-done-cert-key-stage">
                    <div
                      className={`rs-done-cert-key${decodedKey.settled ? " is-settled" : ""}`}
                      aria-label={`Licence key ${lic.license_key}`}
                    >
                      {decodedKey.display || lic.license_key}
                    </div>
                  </div>

                  <div className="rs-done-cert-meta">
                    <div>
                      <span>Plan</span>
                      <strong>{r.plan_name}</strong>
                    </div>
                    <div>
                      <span>Valid until</span>
                      <strong>
                        {lic.expires_at
                          ? new Date(lic.expires_at).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })
                          : "Perpetual (Lifetime)"}
                      </strong>
                    </div>
                    <div className="rs-done-cert-actions no-print">
                      <button
                        type="button"
                        className="rs-cert-btn rs-cert-btn--solid"
                        onClick={() => copyKey(lic.license_key)}
                      >
                        {copiedKey ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                        <span>{copiedKey ? "Copied key" : "Copy key"}</span>
                      </button>

                      {lic.signed_lease ? (
                        <button
                          type="button"
                          className="rs-cert-btn rs-cert-btn--ghost"
                          onClick={downloadLicenseFile}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                          </svg>
                          <span>.cgnlic file</span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rs-done-cert-foot">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <path d="M8 21h8M12 17v4" />
                    </svg>
                    <span>
                      Activate or renew on your school PC: Open <strong>CogniTara Studio Desktop</strong> →{" "}
                      <strong>Licence</strong> → Paste this key.
                    </span>
                  </div>
                </section>
              ) : null}

              {/* ACT 3: Official Payment Receipt Slip & Downloadable PDF CTA */}
              <section className="rs-done-receipt" aria-label="Official payment receipt">
                <div className="rs-done-receipt-head">
                  <div>
                    <span className="rs-done-receipt-eyebrow">Official Payment Receipt</span>
                    <h2>Transaction summary</h2>
                  </div>
                  <span className="rs-done-receipt-status">
                    {isPaid ? "PAID" : isFailed ? "FAILED" : "PENDING"}
                    {r.is_test ? " · TEST" : ""}
                  </span>
                </div>

                <dl className="rs-done-ledger">
                  <div>
                    <dt>School</dt>
                    <dd>{r.school_name}</dd>
                  </div>
                  <div>
                    <dt>Receipt email</dt>
                    <dd className="rs-mono">{r.email}</dd>
                  </div>
                  <div>
                    <dt>Licence plan</dt>
                    <dd>{r.plan_name}</dd>
                  </div>
                  <div>
                    <dt>Reference</dt>
                    <dd className="rs-mono">{r.reference}</dd>
                  </div>
                  <div>
                    <dt>Payment method</dt>
                    <dd>{r.channel}</dd>
                  </div>
                  {r.discount_amount_minor > 0 ? (
                    <div>
                      <dt>Discount{r.promo_code ? ` (${r.promo_code})` : ""}</dt>
                      <dd className="rs-mono">-{fmtMoney(r.discount_amount_minor, r.currency)}</dd>
                    </div>
                  ) : null}
                  {r.fee_minor > 0 ? (
                    <div>
                      <dt>Processing fee</dt>
                      <dd className="rs-mono">{fmtMoney(r.fee_minor, r.currency)}</dd>
                    </div>
                  ) : null}
                  <div className="rs-done-ledger-total">
                    <dt>Total paid</dt>
                    <dd className="rs-mono">{fmtMoney(r.customer_paid_minor ?? r.amount_minor, r.currency)}</dd>
                  </div>
                  <div>
                    <dt>Confirmed at</dt>
                    <dd>
                      {new Date(r.paid_at || r.created_at).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </dd>
                  </div>
                </dl>

                <div className="rs-done-receipt-actions no-print">
                  {isPaid && pdfHref ? (
                    <a href={pdfHref} download={`CogniTara-Receipt-${r.reference}.pdf`} className="rs-btn rs-btn--primary">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                      <span>Download PDF receipt</span>
                    </a>
                  ) : null}

                  {isPaid ? (
                    <button type="button" className="rs-btn rs-btn--soft" onClick={() => window.print()}>
                      Print receipt
                    </button>
                  ) : null}

                  {isFailed ? (
                    <Link
                      href={`/pay/checkout?plan=${encodeURIComponent(r.plan_slug || "annual")}&currency=${r.currency}`}
                      className="rs-btn rs-btn--primary"
                    >
                      Try checkout again
                    </Link>
                  ) : null}

                  {!isPaid && !isFailed ? (
                    <button
                      type="button"
                      className="rs-btn rs-btn--primary"
                      onClick={() => void fetchReceipt(reference, receiptToken)}
                    >
                      Check status now
                    </button>
                  ) : null}

                  <Link href="/download" className="rs-btn rs-btn--soft">
                    Download Desktop App
                  </Link>
                  <Link href="/dashboard" className="rs-btn rs-btn--soft">
                    {data.authenticated ? "School Dashboard" : "Sign in"}
                  </Link>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </main>

      <div className="no-print">
        <LandingFooter />
      </div>
    </div>
  );
}
