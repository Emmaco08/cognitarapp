"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { IconCheck, IconCopy, IconDownload } from "@/components/Icons";

interface ReceiptPayload {
  ok: boolean;
  authenticated?: boolean;
  status: string;
  receipt?: {
    reference: string;
    school_name: string;
    owner_name: string;
    email: string;
    plan_name: string;
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
  return `${sym}${(Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PaymentDonePage() {
  const [reference, setReference] = useState("");
  const [source, setSource] = useState<"web" | "desktop">("web");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReceiptPayload | null>(null);
  const [error, setError] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);

  async function fetchReceipt(ref: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/payments/receipt/${encodeURIComponent(ref)}`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as ReceiptPayload;
      if (!res.ok || !json.ok) {
        setError(json.message || "We could not find this payment reference.");
        setData(null);
      } else {
        setData(json);
      }
    } catch {
      setError("Could not verify your payment right now. Click retry below.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = (params.get("reference") || params.get("trxref") || "").trim();
    const src = params.get("source") === "desktop" ? "desktop" : "web";
    setSource(src);
    setReference(ref);
    if (!ref) {
      setLoading(false);
      setError("No payment reference was provided in the link.");
      return;
    }
    void fetchReceipt(ref);
  }, []);

  // Poll automatically for up to 30s if still waiting on Paystack confirmation
  useEffect(() => {
    if (!reference || !data || data.status === "success" || data.status === "failed" || data.status === "refunded") return;
    const t = setTimeout(() => {
      void fetchReceipt(reference);
    }, 3500);
    return () => clearTimeout(t);
  }, [reference, data]);

  function copyKey(key: string) {
    navigator.clipboard?.writeText(key).catch(() => {});
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 1800);
  }

  function downloadLicenseFile() {
    if (!data?.license?.signed_lease) return;
    const blob = new Blob([JSON.stringify(data.license.signed_lease, null, 2)], { type: "application/json" });
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

  return (
    <div className="ct-shell">
      <BrandHeader signedIn={Boolean(data?.authenticated)} />
      <main className="receipt-wrap">
        <div className="card">
          {loading && !data ? (
            <div className="receipt-hero" style={{ borderBottom: 0, marginBottom: 0, paddingBottom: 8 }}>
              <div className="receipt-check receipt-check--pending">
                <span className="mono" style={{ fontSize: 13 }}>•••</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 22 }}>Confirming your payment</h1>
              <p style={{ margin: 0, color: "var(--ink-2)", maxWidth: "42ch" }}>
                Checking with Paystack and preparing your school licence. This usually takes a couple of seconds.
              </p>
              {reference ? <code className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{reference}</code> : null}
            </div>
          ) : error ? (
            <div className="receipt-hero" style={{ borderBottom: 0, marginBottom: 0 }}>
              <div className="receipt-check receipt-check--bad">!</div>
              <h1 style={{ margin: 0, fontSize: 22 }}>Could not load receipt</h1>
              <p style={{ margin: 0, color: "var(--ink-2)" }}>{error}</p>
              <div className="hq-btn-row no-print" style={{ marginTop: 12 }}>
                {reference ? (
                  <button type="button" className="btn btn--primary" onClick={() => void fetchReceipt(reference)}>
                    Try again
                  </button>
                ) : null}
                <Link href="/dashboard" className="btn btn--ghost">
                  Go to Dashboard
                </Link>
              </div>
            </div>
          ) : r ? (
            <>
              <div className={`receipt-hero ${isPaid ? "receipt-hero--paid" : ""}`}>
                {isPaid ? <div className="pay-celebrate-shimmer" aria-hidden="true" /> : null}
                {isPaid ? (
                  <div className="pay-celebrate-seal" aria-hidden="true">
                    <svg viewBox="0 0 140 140">
                      <circle className="pc-wave pc-wave-1" cx="70" cy="70" r="46" />
                      <circle className="pc-wave pc-wave-2" cx="70" cy="70" r="46" />
                      <circle className="pc-orbit" cx="70" cy="70" r="56" />
                      <g className="pc-sparks">
                        <line className="pc-spark" x1="70" y1="10" x2="70" y2="19" />
                        <line className="pc-spark" x1="112" y1="28" x2="106" y2="34" />
                        <line className="pc-spark" x1="130" y1="70" x2="121" y2="70" />
                        <line className="pc-spark" x1="112" y1="112" x2="106" y2="106" />
                        <line className="pc-spark" x1="70" y1="130" x2="70" y2="121" />
                        <line className="pc-spark" x1="28" y1="112" x2="34" y2="106" />
                        <line className="pc-spark" x1="10" y1="70" x2="19" y2="70" />
                        <line className="pc-spark" x1="28" y1="28" x2="34" y2="34" />
                      </g>
                      <circle className="pc-halo" cx="70" cy="70" r="42" />
                      <circle className="pc-ring" cx="70" cy="70" r="36" pathLength={100} />
                      <path className="pc-check" d="M52 71 L64 83 L89 58" pathLength={100} />
                    </svg>
                  </div>
                ) : (
                  <div className={`receipt-check ${isFailed ? "receipt-check--bad" : "receipt-check--pending"}`}>
                    {isFailed ? "✕" : "…"}
                  </div>
                )}
                {isPaid ? (
                  <span className="pay-celebrate-badge">
                    <i />
                    Verified &amp; Ed25519 Signed
                  </span>
                ) : null}
                <h1 className="pay-celebrate-title" style={{ margin: 0, fontSize: 25, letterSpacing: "-0.028em" }}>
                  {isPaid
                    ? "Payment confirmed"
                    : isFailed
                    ? "Payment was not completed"
                    : "Waiting for confirmation"}
                </h1>
                <p className="pay-celebrate-sub" style={{ margin: 0, color: "var(--ink-2)", maxWidth: "46ch" }}>
                  {isPaid
                    ? `Thank you! Your ${r.plan_name} for ${r.school_name} is now active${r.is_test ? " (Test payment)" : ""}. A receipt has also been emailed to ${r.email}.`
                    : isFailed
                    ? "Your card or transfer was not completed. No active licence was charged — you can try again from your dashboard."
                    : "We are waiting for Paystack to finish confirming this payment. This page updates automatically."}
                </p>
              </div>

              {isPaid && source === "desktop" ? (
                <div className="alert alert--ok">
                  <strong>CogniTara Studio syncs automatically.</strong> You can return to the desktop app now — your licence activates within seconds.
                </div>
              ) : null}

              {isPaid && lic ? (
                <div className="receipt-key-box">
                  <div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 3 }}>Active Licence Key</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 740, color: "var(--ok)", letterSpacing: "0.04em" }}>
                      {lic.license_key}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                      Valid until: {lic.expires_at ? new Date(lic.expires_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "Perpetual (Never expires)"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
                      Paste this key inside <strong>CogniTara Studio Desktop → Licence → Enter key</strong>.
                    </div>
                  </div>
                  <div className="hq-btn-row no-print">
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => copyKey(lic.license_key)}>
                      <IconCopy size={14} />
                      <span>{copiedKey ? "Copied" : "Copy key"}</span>
                    </button>
                    {lic.signed_lease ? (
                      <button type="button" className="btn btn--primary btn--sm" onClick={downloadLicenseFile}>
                        <IconDownload size={14} />
                        <span>Download .cgnlic</span>
                      </button>
                    ) : (
                      <Link href="/download" className="btn btn--primary btn--sm">
                        <IconDownload size={14} />
                        <span>Download Studio</span>
                      </Link>
                    )}
                  </div>
                </div>
              ) : null}

              <dl className="dl">
                <div>
                  <dt>School</dt>
                  <dd>{r.school_name}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>{r.plan_name}</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd className="mono" style={{ fontSize: 12.5 }}>{r.reference}</dd>
                </div>
                <div>
                  <dt>Payment method</dt>
                  <dd>
                    {r.channel}
                    {r.is_test ? <span className="tag-test">Test</span> : null}
                  </dd>
                </div>
                {r.discount_amount_minor > 0 ? (
                  <div>
                    <dt>Discount{r.promo_code ? ` (${r.promo_code})` : ""}</dt>
                    <dd className="mono" style={{ color: "var(--ok)" }}>-{fmtMoney(r.discount_amount_minor, r.currency)}</dd>
                  </div>
                ) : null}
                {r.fee_minor > 0 ? (
                  <div>
                    <dt>Paystack processing fee</dt>
                    <dd className="mono">{fmtMoney(r.fee_minor, r.currency)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt style={{ fontWeight: 680, color: "var(--ink)" }}>Total paid</dt>
                  <dd className="mono" style={{ fontSize: 16, fontWeight: 740 }}>
                    {fmtMoney(r.customer_paid_minor || r.amount_minor, r.currency)}
                  </dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd className="tnum">
                    {new Date(r.paid_at || r.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </dd>
                </div>
              </dl>

              <div className="hq-btn-row no-print" style={{ marginTop: 22, justifyContent: "space-between" }}>
                <div className="hq-btn-row">
                  <Link href="/dashboard" className="btn btn--primary">
                    {data?.authenticated ? "Return to Dashboard" : "Sign in to Dashboard"}
                  </Link>
                  {!isPaid && !isFailed ? (
                    <button type="button" className="btn btn--ghost" onClick={() => void fetchReceipt(reference)}>
                      Check status now
                    </button>
                  ) : null}
                </div>
                {isPaid ? (
                  <button type="button" className="btn btn--outline" onClick={() => window.print()}>
                    Print receipt
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
