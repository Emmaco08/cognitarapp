"use client";

import React, { useEffect, useState } from "react";
import { IconCopy } from "@/components/Icons";

export interface HqSettingsData {
  paystack_mode: "test" | "live";
  paystack_live_public_key: string;
  paystack_live_public_masked: string;
  paystack_live_secret_masked: string;
  paystack_live_configured: boolean;
  paystack_test_public_key: string;
  paystack_test_public_masked: string;
  paystack_test_secret_masked: string;
  paystack_test_configured: boolean;
  paystack_fee_mode: "merchant" | "customer_added" | "paystack_checkout";
  paystack_fee_pct: number;
  paystack_fee_flat_ngn: number;
  paystack_fee_cap_ngn: number;
  paystack_fee_flat_threshold_ngn: number;
  test_mode_staff_only: boolean;
  test_payments_count: number;
  latest_payment_fee_summary: {
    reference: string;
    plan_name: string;
    currency: string;
    plan_price_minor: number;
    customer_paid_minor: number;
    paystack_fee_minor: number;
    channel: string;
    is_test: boolean;
    paid_at: string;
    inferred_dashboard_setting: "charge_customer" | "charge_merchant";
  } | null;
  webhook_url: string;
  callback_url: string;
  default_currency: string;
  brevo_api_key_masked: string;
  brevo_configured: boolean;
  brevo_sender_email: string;
  brevo_sender_name: string;
  require_email_otp: boolean;
  require_hq_2fa: boolean;
  backup_reminder_days: number;
  maintenance_mode: boolean;
  maintenance_message: string;
  min_desktop_version: string;
  global_announcement: string;
  global_announcement_level: string;
  allow_self_signup: boolean;
  allow_paystack_checkout: boolean;
  allow_trial_activation: boolean;
  free_trial_days: number;
  promo_banner_enabled: boolean;
  promo_banner_event: string;
  promo_banner_text: string;
  promo_banner_code: string;
}

interface HqPaymentSettingsTabProps {
  settings: HqSettingsData;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
  onTestProvider: (provider: "paystack" | "brevo", extra?: Record<string, unknown>) => Promise<void>;
  onToast: (msg: string) => void;
}

function fmtMoney(minor: number, currency = "NGN") {
  const sym = currency === "USD" ? "$" : "₦";
  return `${sym}${(Number(minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HqPaymentSettingsTab({
  settings,
  onSaveSettings,
  onTestProvider,
  onToast,
}: HqPaymentSettingsTabProps) {
  const [mode, setMode] = useState<"test" | "live">(settings.paystack_mode);
  const [liveSec, setLiveSec] = useState("");
  const [livePub, setLivePub] = useState("");
  const [testSec, setTestSec] = useState("");
  const [testPub, setTestPub] = useState("");
  const [staffOnlyTest, setStaffOnlyTest] = useState(Boolean(settings.test_mode_staff_only));
  const [feeMode, setFeeMode] = useState<"merchant" | "customer_added" | "paystack_checkout">(settings.paystack_fee_mode);
  const [feePct, setFeePct] = useState(String(settings.paystack_fee_pct ?? 1.5));
  const [feeFlat, setFeeFlat] = useState(String(settings.paystack_fee_flat_ngn ?? 100));
  const [feeCap, setFeeCap] = useState(String(settings.paystack_fee_cap_ngn ?? 2000));
  const [feeThreshold, setFeeThreshold] = useState(String(settings.paystack_fee_flat_threshold_ngn ?? 2500));
  const [currency, setCurrency] = useState(settings.default_currency || "NGN");
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  useEffect(() => {
    setMode(settings.paystack_mode);
    setStaffOnlyTest(Boolean(settings.test_mode_staff_only));
    setFeeMode(settings.paystack_fee_mode);
    setFeePct(String(settings.paystack_fee_pct ?? 1.5));
    setFeeFlat(String(settings.paystack_fee_flat_ngn ?? 100));
    setFeeCap(String(settings.paystack_fee_cap_ngn ?? 2000));
    setFeeThreshold(String(settings.paystack_fee_flat_threshold_ngn ?? 2500));
    setCurrency(settings.default_currency || "NGN");
  }, [settings]);

  function copyVal(text: string, id: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedKey(id);
    onToast("Copied to clipboard.");
    setTimeout(() => setCopiedKey((c) => (c === id ? "" : c)), 1800);
  }

  async function saveAll(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveSettings({
        paystack_mode: mode,
        paystack_live_secret_key: liveSec.trim() || undefined,
        paystack_live_public_key: livePub.trim() || undefined,
        paystack_test_secret_key: testSec.trim() || undefined,
        paystack_test_public_key: testPub.trim() || undefined,
        test_mode_staff_only: staffOnlyTest,
        paystack_fee_mode: feeMode,
        paystack_fee_pct: Number(feePct),
        paystack_fee_flat_ngn: Number(feeFlat),
        paystack_fee_cap_ngn: Number(feeCap),
        paystack_fee_flat_threshold_ngn: Number(feeThreshold),
        default_currency: currency,
      });
      setLiveSec("");
      setLivePub("");
      setTestSec("");
      setTestPub("");
    } finally {
      setSaving(false);
    }
  }

  const latest = settings.latest_payment_fee_summary;

  return (
    <form onSubmit={saveAll} style={{ display: "grid", gap: 20 }}>
      <div className="hq-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Payment settings</h1>
          <p>
            Configure how schools pay on the website and inside CogniTara Studio, switch between Live and
            Test keys, and choose who covers Paystack processing fees. Changes take effect immediately.
          </p>
        </div>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? "Saving…" : "Save payment settings"}
        </button>
      </div>

      {/* Section 1: Paystack Live vs Test Mode + Dual Encrypted Key Slots */}
      <section className="card" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Paystack: Test or Live</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
              Your secret keys are encrypted at rest and never exposed back to any browser or desktop app.
            </p>
          </div>
          <span className={`status-txt ${mode === "live" ? "status-txt--ok" : "status-txt--warn"}`}>
            Now: {mode === "live" ? "Live (real money)" : "Test (sandbox)"}
          </span>
        </div>

        <div className="choice-grid">
          <button
            type="button"
            className={`choice-card ${mode === "live" ? "is-selected" : ""}`}
            onClick={() => setMode("live")}
          >
            <strong>Live {mode === "live" ? "· in use" : ""}</strong>
            <p>Schools pay with real cards, bank transfers, and USSD. Revenue counts in totals.</p>
          </button>

          <button
            type="button"
            className={`choice-card ${mode === "test" ? "is-selected" : ""}`}
            onClick={() => setMode("test")}
          >
            <strong>Test {mode === "test" ? "· in use" : ""}</strong>
            <p>Uses Paystack test cards. Test orders are tagged Test and left out of real revenue.</p>
          </button>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="liveSec">
              <span>Live secret key</span>
              <span className="mono" style={{ fontSize: 11.5, color: settings.paystack_live_configured ? "var(--ok)" : "var(--ink-3)" }}>
                {settings.paystack_live_secret_masked || "Not set"}
              </span>
            </label>
            <input
              id="liveSec"
              type="password"
              className="mono"
              value={liveSec}
              onChange={(e) => setLiveSec(e.target.value)}
              placeholder="Replace: sk_live_…"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="livePub">
              <span>Live public key</span>
              <span className="mono" style={{ fontSize: 11.5, color: settings.paystack_live_public_key ? "var(--ok)" : "var(--ink-3)" }}>
                {settings.paystack_live_public_masked || "Not set"}
              </span>
            </label>
            <input
              id="livePub"
              className="mono"
              value={livePub}
              onChange={(e) => setLivePub(e.target.value)}
              placeholder="Replace: pk_live_…"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="testSec">
              <span>Test secret key</span>
              <span className="mono" style={{ fontSize: 11.5, color: settings.paystack_test_configured ? "var(--ok)" : "var(--ink-3)" }}>
                {settings.paystack_test_secret_masked || "Not set"}
              </span>
            </label>
            <input
              id="testSec"
              type="password"
              className="mono"
              value={testSec}
              onChange={(e) => setTestSec(e.target.value)}
              placeholder="Replace: sk_test_…"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="testPub">
              <span>Test public key</span>
              <span className="mono" style={{ fontSize: 11.5, color: settings.paystack_test_public_key ? "var(--ok)" : "var(--ink-3)" }}>
                {settings.paystack_test_public_masked || "Not set"}
              </span>
            </label>
            <input
              id="testPub"
              className="mono"
              value={testPub}
              onChange={(e) => setTestPub(e.target.value)}
              placeholder="Replace: pk_test_…"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="hq-btn-row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void onTestProvider("paystack", { slot: "live" })}>
            Test Live key
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void onTestProvider("paystack", { slot: "test" })}>
            Test Sandbox key
          </button>
        </div>

        <div className="hq-switch-row" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div>
            <strong>Restrict Test mode checkout to staff accounts only</strong>
            <span>When turned on in Test mode, regular schools see “payments paused for a few minutes”.</span>
          </div>
          <input
            type="checkbox"
            checked={staffOnlyTest}
            onChange={(e) => setStaffOnlyTest(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: "var(--accent)", cursor: "pointer" }}
          />
        </div>

        <div className="hq-section-block" style={{ gap: 12 }}>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
            In your Paystack dashboard (<strong>Settings → API Keys &amp; Webhooks</strong>), paste these on both the Test and Live tabs:
          </div>

          <div className="form-row">
            <div className="field">
              <label>Webhook URL</label>
              <div className="copy-box">
                <code className="mono">{settings.webhook_url}</code>
                <button type="button" className="btn btn--ghost btn--xs" onClick={() => copyVal(settings.webhook_url, "wh")}>
                  <IconCopy size={13} />
                  <span>{copiedKey === "wh" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <div className="field">
              <label>Callback URL</label>
              <div className="copy-box">
                <code className="mono">{settings.callback_url}</code>
                <button type="button" className="btn btn--ghost btn--xs" onClick={() => copyVal(settings.callback_url, "cb")}>
                  <IconCopy size={13} />
                  <span>{copiedKey === "cb" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
            Payments are also confirmed automatically on the receipt page (<code className="mono">/pay/done</code>), and setting the webhook guarantees instant background fulfillment.{" "}
            <strong style={{ color: "var(--ink-2)" }}>{settings.test_payments_count} test payment(s)</strong> so far; they are marked Test and left out of real revenue.
          </div>
        </div>
      </section>

      {/* Section 2: Who pays Paystack's fee? */}
      <section className="card" style={{ display: "grid", gap: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>Who pays Paystack&apos;s fee?</h2>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
            Applies to both website checkout and CogniTara Studio desktop checkout. Match this choice in your Paystack dashboard (Settings → Preferences → Who should be charged transaction fees?).
          </p>
        </div>

        <div className="choice-grid">
          <button
            type="button"
            className={`choice-card ${feeMode === "merchant" ? "is-selected" : ""}`}
            onClick={() => setFeeMode("merchant")}
          >
            <strong>CogniTara pays it</strong>
            <p>Schools pay the exact plan price. Paystack deducts its processing fee from your settlement.</p>
            <small>Paystack dashboard: Charge me</small>
          </button>

          <button
            type="button"
            className={`choice-card ${feeMode === "customer_added" ? "is-selected" : ""}`}
            onClick={() => setFeeMode("customer_added")}
          >
            <strong>Schools pay it — added by CogniTara</strong>
            <p>The fee is calculated and displayed as its own line before paying using the numbers below.</p>
            <small>Paystack dashboard: Charge me</small>
          </button>

          <button
            type="button"
            className={`choice-card ${feeMode === "paystack_checkout" ? "is-selected" : ""}`}
            onClick={() => setFeeMode("paystack_checkout")}
          >
            <strong>Schools pay it — added by Paystack</strong>
            <p>Paystack adds its exact fee on its checkout screen. We show “+ Paystack fee at checkout”.</p>
            <small>Paystack dashboard: Charge my customers</small>
          </button>
        </div>

        {feeMode === "customer_added" ? (
          <div className="form-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div className="field">
              <label htmlFor="feePct">Fee percentage (%)</label>
              <input id="feePct" type="number" step="0.1" value={feePct} onChange={(e) => setFeePct(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="feeFlat">Flat fee (₦)</label>
              <input id="feeFlat" type="number" value={feeFlat} onChange={(e) => setFeeFlat(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="feeThresh">Waive flat below (₦)</label>
              <input id="feeThresh" type="number" value={feeThreshold} onChange={(e) => setFeeThreshold(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="feeCap">Maximum cap (₦)</label>
              <input id="feeCap" type="number" value={feeCap} onChange={(e) => setFeeCap(e.target.value)} />
            </div>
          </div>
        ) : null}

        <div className="form-row">
          <div className="field">
            <label htmlFor="defCur">Default checkout currency</label>
            <select id="defCur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="NGN">NGN (₦ Nigerian Naira)</option>
              <option value="USD">USD ($ US Dollar)</option>
              <option value="GHS">GHS (Ghanaian Cedi)</option>
              <option value="KES">KES (Kenyan Shilling)</option>
            </select>
          </div>
          <div />
        </div>

        {/* Live breakdown from the latest verified Paystack payment */}
        <div className="hq-section-block">
          <h3>What Paystack did on your latest payment</h3>
          {latest ? (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
              Plan price <strong className="mono" style={{ color: "var(--ink)" }}>{fmtMoney(latest.plan_price_minor, latest.currency)}</strong>,
              school paid <strong className="mono" style={{ color: "var(--ink)" }}>{fmtMoney(latest.customer_paid_minor, latest.currency)}</strong>,
              Paystack&apos;s fee <strong className="mono" style={{ color: "var(--ink)" }}>{fmtMoney(latest.paystack_fee_minor, latest.currency)}</strong>{" "}
              ({latest.channel}{latest.is_test ? ", Test" : ""}).{" "}
              {latest.inferred_dashboard_setting === "charge_customer"
                ? "Your Paystack dashboard charged the customer the fee."
                : "Your Paystack dashboard deducted the fee from your settlement."}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>
              Once your first Paystack payment completes, the exact price, amount paid, and Paystack fee breakdown will appear here automatically.
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
