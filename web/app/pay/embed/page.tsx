"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

declare global {
  interface Window {
    PaystackPop?: new () => {
      resumeTransaction: (
        accessCode: string,
        callbacks?: {
          onSuccess?: (tx: { reference?: string; trxref?: string }) => void;
          onCancel?: () => void;
          onError?: (err: { message?: string }) => void;
          onLoad?: () => void;
        }
      ) => void;
    };
  }
}

function EmbeddedPaystackInner() {
  const params = useSearchParams();
  const accessCode = (params.get("access_code") || "").trim();
  const reference = (params.get("reference") || "").trim();
  const planName = (params.get("plan") || "CogniTara Studio Licence").trim();
  const amountLabel = (params.get("amount") || "").trim();
  const theme = params.get("theme") === "light" ? "light" : "dark";
  const fallbackUrl = (params.get("fallback_url") || "").trim();

  const [status, setStatus] = useState<"loading" | "ready" | "success" | "cancelled" | "error">("loading");
  const [detail, setDetail] = useState("Connecting securely to Paystack…");
  const launchedRef = useRef(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function launchInlineCheckout() {
    if (!accessCode) {
      setStatus("error");
      setDetail("Missing Paystack transaction access code.");
      return;
    }
    if (!window.PaystackPop) {
      setStatus("error");
      setDetail("Paystack Inline SDK did not finish loading.");
      return;
    }

    try {
      setStatus("ready");
      setDetail("Complete your payment securely below.");
      const popup = new window.PaystackPop();
      popup.resumeTransaction(accessCode, {
        onSuccess: (tx) => {
          const ref = (tx && (tx.reference || tx.trxref)) || reference;
          setStatus("success");
          setDetail("Payment received! Verifying and activating your licence…");
          try {
            window.location.hash = `ct_pay_success=${encodeURIComponent(ref)}`;
          } catch {}
        },
        onCancel: () => {
          setStatus("cancelled");
          setDetail("Checkout closed before payment completed.");
          try {
            window.location.hash = `ct_pay_cancel=${Date.now()}`;
          } catch {}
        },
        onError: (err) => {
          setStatus("error");
          setDetail(err?.message || "Paystack checkout encountered an error.");
        },
      });
    } catch (e: any) {
      setStatus("error");
      setDetail(e?.message || "Could not launch Paystack Inline checkout.");
    }
  }

  useEffect(() => {
    if (!accessCode) {
      setStatus("error");
      setDetail("Invalid checkout link — missing access code.");
      return;
    }
    if (launchedRef.current) return;
    launchedRef.current = true;

    if (window.PaystackPop) {
      launchInlineCheckout();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.onload = () => launchInlineCheckout();
    script.onerror = () => {
      setStatus("error");
      setDetail("Could not load Paystack Inline SDK over this connection.");
    };
    document.head.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessCode]);

  function openHostedFallback() {
    if (fallbackUrl && (fallbackUrl.startsWith("https://checkout.paystack.com/") || fallbackUrl.startsWith("https://standard.paystack.co/"))) {
      window.location.href = fallbackUrl;
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--bg)",
        color: "var(--ink)",
      }}
    >
      <div
        className="card"
        style={{
          width: "min(440px, 100%)",
          display: "grid",
          gap: 16,
          textAlign: "center",
          padding: 28,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            margin: "0 auto",
            display: "grid",
            placeItems: "center",
            background:
              status === "success"
                ? "var(--ok-soft)"
                : status === "error"
                  ? "var(--bad-soft)"
                  : "var(--accent-soft)",
            color:
              status === "success"
                ? "var(--ok)"
                : status === "error"
                  ? "var(--bad)"
                  : "var(--accent)",
          }}
        >
          {status === "success" ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
          )}
        </div>

        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {status === "success"
              ? "Payment Confirmed"
              : status === "cancelled"
                ? "Checkout Closed"
                : status === "error"
                  ? "Checkout Unavailable"
                  : planName}
          </h1>
          {amountLabel ? (
            <div className="mono tnum" style={{ fontSize: 22, fontWeight: 760, color: "var(--ink)" }}>
              {amountLabel}
            </div>
          ) : null}
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5 }}>{detail}</p>
        </div>

        {status === "cancelled" || status === "ready" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={launchInlineCheckout}>
              Reopen Paystack Checkout
            </button>
          </div>
        ) : null}

        {status === "error" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <button type="button" className="btn btn--primary" onClick={launchInlineCheckout}>
              Retry Inline Checkout
            </button>
            {fallbackUrl ? (
              <button type="button" className="btn btn--outline" onClick={openHostedFallback}>
                Continue on Paystack Checkout Page
              </button>
            ) : null}
          </div>
        ) : null}

        {reference ? (
          <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            Ref: {reference}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function EmbeddedPaystackPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--ink-2)" }}>
          Loading secure checkout…
        </div>
      }
    >
      <EmbeddedPaystackInner />
    </Suspense>
  );
}
