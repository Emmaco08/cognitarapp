"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { PlanEmblem } from "@/components/PlanEmblem";
import { PortalPowerDial } from "@/components/portal/PortalPowerDial";
import {
  IconCloud,
  IconCopy,
  IconCreditCard,
  IconDownload,
  IconGift,
  IconKey,
} from "@/components/Icons";

interface AccountPayload {
  ok: boolean;
  user: { id: string; email: string; full_name: string; phone: string; role: string; status: string };
  school: {
    id: string;
    school_code?: string;
    school_name: string;
    country_code: string;
    status: string;
    last_cloud_backup_at?: string | null;
    online_portal_enabled?: boolean;
    online_teachers_enabled?: boolean;
    online_students_enabled?: boolean;
    online_synced_at?: string | null;
  } | null;
  referral_code: string | null;
  licenses: Array<{
    id: string;
    license_key: string;
    plan_tier: string;
    plan_name?: string;
    status: string;
    issued_at?: string;
    expires_at: string | null;
    signed_lease_json?: Record<string, unknown> | null;
  }>;
  directives?: {
    global_announcement?: string;
    school_notice?: string;
    paystack_mode?: "test" | "live";
    paystack_fee_mode?: "merchant" | "customer_added" | "paystack_checkout";
    paystack_fee_pct?: number;
    paystack_fee_flat_ngn?: number;
    paystack_fee_cap_ngn?: number;
    paystack_fee_flat_threshold_ngn?: number;
    backup_reminder_days?: number;
    last_cloud_backup_at?: string | null;
  };
}

interface PlanItem {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  badge: string;
  duration_days: number | null;
  lease_days: number;
  price_ngn_kobo: number;
  price_usd_cents: number;
  features_json?: { highlights?: string[] };
}

interface PaymentRecord {
  id: string;
  paystack_reference: string;
  currency: string;
  amount_minor: number;
  customer_paid_minor: number;
  fee_minor: number;
  discount_amount_minor: number;
  promo_code_text: string | null;
  payment_channel: string;
  paystack_sub_channel: string | null;
  is_test: boolean;
  status: string;
  paid_at: string | null;
  created_at: string;
  plan_name: string;
  license_key: string | null;
}

interface ReferralData {
  referral: {
    referral_code: string;
    share_url: string;
    commission_pct: number;
    bonus_days: number;
    reward_mode: string;
  } | null;
  stats: {
    schools_signed_up: number;
    paid_conversions: number;
    wallet_balance_minor: number;
    total_earned_minor: number;
    total_bonus_days: number;
  };
  referred_schools: Array<{ id: string; school_name: string; created_at: string }>;
  conversions: Array<{
    id: string;
    referred_school_name: string;
    commission_amount_kobo: number;
    bonus_days_granted_referrer: number;
    status: string;
    created_at: string;
  }>;
  payout_requests: Array<{
    id: string;
    amount_minor: number;
    bank_code: string;
    account_number_masked: string;
    status: string;
    created_at: string;
  }>;
}

interface BackupPayload {
  backup_reminder_days: number;
  last_backup_at: string | null;
  days_since_last_backup: number | null;
  backup_due: boolean;
  backups: Array<{
    id: string;
    filename: string;
    label: string;
    app_version: string | null;
    raw_size_bytes: number;
    compressed_bytes: number;
    sha256: string;
    stats_json?: { exams?: number; students?: number; questions?: number; scores?: number };
    created_at: string;
  }>;
}

const RELEASES_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

function fmtMoney(minor: number, currency = "NGN") {
  const sym = currency === "USD" ? "$" : "₦";
  return `${sym}${(Number(minor || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtBytes(bytes: number) {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function estimateAddedFee(
  baseMinor: number,
  currency: string,
  d?: AccountPayload["directives"]
): { feeMinor: number; note: string } {
  const mode = d?.paystack_fee_mode || "merchant";
  if (mode === "merchant") return { feeMinor: 0, note: "No extra processing fee" };
  if (mode === "paystack_checkout") return { feeMinor: 0, note: "+ Paystack processing fee at checkout" };
  if (currency === "USD") {
    return { feeMinor: Math.round(baseMinor * 0.039) + 100, note: "Includes processing fee" };
  }
  const pct = (Number(d?.paystack_fee_pct ?? 1.5) || 1.5) / 100;
  const flat = Number(d?.paystack_fee_flat_ngn ?? 100) * 100;
  const cap = Number(d?.paystack_fee_cap_ngn ?? 2000) * 100;
  const threshold = Number(d?.paystack_fee_flat_threshold_ngn ?? 2500) * 100;
  const appliesFlat = baseMinor >= threshold ? flat : 0;
  const grossed = Math.ceil((baseMinor + appliesFlat) / Math.max(0.5, 1 - pct)) - baseMinor;
  const feeMinor = cap > 0 ? Math.min(cap, Math.max(0, grossed)) : Math.max(0, grossed);
  return { feeMinor, note: `Includes ${fmtMoney(feeMinor, "NGN")} Paystack fee` };
}

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "portal" | "billing" | "referrals" | "backups">("overview");
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [referrals, setReferrals] = useState<ReferralData | null>(null);
  const [backups, setBackups] = useState<BackupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");

  const [copiedId, setCopiedId] = useState<string>("");
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; message: string; discountPct?: number; discountKind?: string; discountValue?: number } | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "bad" | "warn"; text: string } | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  // Payout request form
  const [payoutAmt, setPayoutAmt] = useState("");
  const [payoutBank, setPayoutBank] = useState("");
  const [payoutAcct, setPayoutAcct] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);

  async function loadAll() {
    const [meRes, plansRes, payRes, refRes, bakRes] = await Promise.all([
      fetch("/api/v1/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/plans").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/payments/history", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/referrals/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/backups", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!meRes || !meRes.ok) {
      router.replace("/signin");
      return;
    }
    setAccount(meRes);
    if (plansRes?.ok && Array.isArray(plansRes.plans)) setPlans(plansRes.plans);
    if (payRes?.ok && Array.isArray(payRes.payments)) setPayments(payRes.payments);
    if (refRes?.ok) setReferrals(refRes);
    if (bakRes?.ok) setBackups(bakRes);
    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("paystack_ref") || params.get("reference") || params.get("trxref");
    if (ref) {
      router.replace(`/pay/done?reference=${encodeURIComponent(ref)}`);
      return;
    }
    const qTab = params.get("tab");
    if (qTab === "portal" || qTab === "billing" || qTab === "referrals" || qTab === "backups") {
      setTab(qTab);
    }
    void loadAll();
  }, [router]);

  async function handleSignOut() {
    await fetch("/api/v1/auth/signout", { method: "POST", credentials: "include" });
    router.push("/signin");
  }

  function copyText(text: string, id: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? "" : cur)), 1800);
  }

  function downloadLicenseFile(lic: AccountPayload["licenses"][number]) {
    if (!lic.signed_lease_json) return;
    const blob = new Blob([JSON.stringify(lic.signed_lease_json, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lic.license_key}.cgnlic`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function applyPromoCode() {
    const clean = promoCode.trim().toUpperCase();
    if (!clean) {
      setAppliedPromo(null);
      return;
    }
    setMsg(null);
    const firstPlan = plans[0];
    const res = await fetch("/api/v1/promo/validate", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: clean, plan_id: firstPlan?.id, currency }),
    }).then((r) => r.json()).catch(() => null);

    if (!res?.ok) {
      setAppliedPromo(null);
      setMsg({ kind: "bad", text: res?.message || "Invalid discount code." });
      return;
    }
    if (res.code_type === "redeem" || res.is_free) {
      setRedeemCode(clean);
      setPromoCode("");
      setTab("overview");
      setMsg({ kind: "ok", text: "This is a 100% free voucher code. Click Redeem in the Overview tab to activate immediately." });
      return;
    }
    setAppliedPromo({
      code: clean,
      message: res.message || "Discount applied!",
      discountKind: res.discount_kind,
      discountValue: Number(res.discount_value || 0),
    });
    setMsg({ kind: "ok", text: res.message || `Code ${clean} applied to plans below.` });
  }

  function computeDiscountedMinor(origMinor: number): number {
    if (!appliedPromo) return origMinor;
    const val = Number(appliedPromo.discountValue || 0);
    if (appliedPromo.discountKind === "percent") {
      return Math.max(0, origMinor - Math.round((origMinor * Math.min(100, val)) / 100));
    }
    if (appliedPromo.discountKind === "fixed_ngn" && currency === "NGN") {
      return Math.max(0, origMinor - Math.round(val * 100));
    }
    if (appliedPromo.discountKind === "fixed_usd" && currency === "USD") {
      return Math.max(0, origMinor - Math.round(val * 100));
    }
    return origMinor;
  }

  async function buyPlan(planId: string) {
    setMsg(null);
    setBusyPlanId(planId);
    try {
      const codeToUse = (appliedPromo?.code || promoCode.trim()).toUpperCase() || undefined;
      const res = await fetch("/api/v1/payments/paystack/initialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, currency, promo_code: codeToUse, source: "web" }),
      }).then((r) => r.json());
      if (!res?.ok || !res.authorization_url) {
        setMsg({ kind: "bad", text: res?.message || "Could not launch Paystack checkout." });
        return;
      }
      window.location.href = res.authorization_url;
    } finally {
      setBusyPlanId(null);
    }
  }

  async function redeemVoucher(e: React.FormEvent) {
    e.preventDefault();
    if (!redeemCode.trim()) return;
    setMsg(null);
    const res = await fetch("/api/v1/promo/redeem", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: redeemCode.trim().toUpperCase(), currency }),
    }).then((r) => r.json());
    if (res?.ok) {
      setRedeemCode("");
      if (res.redirect_url) {
        router.push(String(res.redirect_url));
        return;
      }
      setMsg({ kind: "ok", text: `${res.message} Licence key: ${res.license?.license_key}` });
      await loadAll();
    } else {
      setMsg({ kind: "bad", text: res?.message || "Could not redeem code." });
    }
  }

  async function submitPayout(e: React.FormEvent) {
    e.preventDefault();
    setPayoutBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/referrals/me", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_ngn: Number(payoutAmt),
          bank_code: payoutBank,
          account_number: payoutAcct,
        }),
      }).then((r) => r.json());
      if (!res?.ok) {
        setMsg({ kind: "bad", text: res?.message || "Could not submit payout request." });
      } else {
        setMsg({ kind: "ok", text: res.message || "Payout request submitted!" });
        setPayoutAmt("");
        setPayoutAcct("");
        await loadAll();
      }
    } finally {
      setPayoutBusy(false);
    }
  }

  async function deleteBackup(id: string) {
    const res = await fetch(`/api/v1/backups?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    }).then((r) => r.json());
    if (res?.ok) {
      setMsg({ kind: "ok", text: "Cloud backup removed." });
      await loadAll();
    }
  }

  const isHq = account?.user.role === "hq_super_admin" || account?.user.role === "hq_admin";
  const activeLic = useMemo(
    () => account?.licenses.find((l) => l.status === "active" || l.status === "issued") || account?.licenses[0] || null,
    [account]
  );

  return (
    <div className="ct-shell">
      <BrandHeader signedIn={Boolean(account)} isHq={isHq} />

      {loading || !account ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <p style={{ margin: 0, color: "var(--ink-2)" }}>Loading your school workspace…</p>
        </div>
      ) : (
        <main>
          {msg ? <div className={`alert alert--${msg.kind}`}>{msg.text}</div> : null}

          {account.directives?.school_notice || account.directives?.global_announcement ? (
            <div className="alert alert--info">
              <span>
                <strong>Notice:</strong> {account.directives.school_notice || account.directives.global_announcement}
              </span>
            </div>
          ) : null}

          {backups?.backup_due ? (
            <div className="alert alert--warn" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <span>
                <strong>Exam backup reminder:</strong>{" "}
                {backups.days_since_last_backup === null
                  ? `You have not backed up your exam database to CogniTara Cloud yet (recommended every ${backups.backup_reminder_days} days). Open CogniTara Studio → Backups to sync.`
                  : `Your last cloud exam backup was ${backups.days_since_last_backup} days ago (reminder set to every ${backups.backup_reminder_days} days).`}
              </span>
              <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTab("backups")}>
                View backups
              </button>
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontFamily: "var(--serif)", fontWeight: 400, fontSize: "clamp(26px, 3vw, 34px)", lineHeight: 1.1, letterSpacing: "-0.022em" }}>
                {account.school?.school_name || account.user.full_name}
              </h1>
              <p style={{ margin: "6px 0 0", color: "var(--ink-2)" }}>
                {account.user.full_name} · {account.user.email}
              </p>
            </div>
            <div className="hq-btn-row">
              {isHq ? (
                <Link href="/hq" className="btn btn--primary btn--sm">
                  Open Admin Console
                </Link>
              ) : null}
              <Link href="/download" className={isHq ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}>
                <IconDownload size={14} />
                <span>Download Desktop App</span>
              </Link>
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>

          <div className="tabs-bar" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "overview"} className={`tab-btn ${tab === "overview" ? "is-active" : ""}`} onClick={() => setTab("overview")}>
              <IconKey size={15} />
              <span>Overview &amp; Licence</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "portal"} className={`tab-btn ${tab === "portal" ? "is-active" : ""}`} onClick={() => setTab("portal")}>
              <IconCloud size={15} />
              <span>Online Portal</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "billing"} className={`tab-btn ${tab === "billing" ? "is-active" : ""}`} onClick={() => setTab("billing")}>
              <IconCreditCard size={15} />
              <span>Plans &amp; Billing</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "referrals"} className={`tab-btn ${tab === "referrals" ? "is-active" : ""}`} onClick={() => setTab("referrals")}>
              <IconGift size={15} />
              <span>Referrals &amp; Rewards</span>
            </button>
            <button type="button" role="tab" aria-selected={tab === "backups"} className={`tab-btn ${tab === "backups" ? "is-active" : ""}`} onClick={() => setTab("backups")}>
              <IconCloud size={15} />
              <span>Cloud Backups</span>
            </button>
          </div>

          {tab === "overview" ? (
            <div className="dash-grid">
              <section className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <h2 style={{ margin: 0, fontSize: 16 }}>Your School Licence</h2>
                  {activeLic ? (
                    <span className={`status-txt ${activeLic.status === "revoked" || activeLic.status === "expired" ? "status-txt--bad" : "status-txt--ok"}`}>
                      {activeLic.status}
                    </span>
                  ) : null}
                </div>

                {activeLic ? (
                  <>
                    <div className="receipt-key-box" style={{ marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{activeLic.plan_name || activeLic.plan_tier}</div>
                        <div className="mono" style={{ fontSize: 17, fontWeight: 720, marginTop: 2 }}>{activeLic.license_key}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                          {activeLic.expires_at
                            ? `Expires ${new Date(activeLic.expires_at).toLocaleDateString(undefined, { dateStyle: "medium" })}`
                            : "Perpetual licence (never expires)"}
                        </div>
                      </div>
                      <div className="hq-btn-row">
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => copyText(activeLic.license_key, "lic-key")}>
                          <IconCopy size={14} />
                          <span>{copiedId === "lic-key" ? "Copied" : "Copy"}</span>
                        </button>
                        {activeLic.signed_lease_json ? (
                          <button type="button" className="btn btn--primary btn--sm" onClick={() => downloadLicenseFile(activeLic)}>
                            <IconDownload size={14} />
                            <span>.cgnlic</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: "0 0 12px", color: "var(--ink-2)" }}>
                      No active licence on this school account yet. Choose a plan to unlock unlimited exams on your Windows exam server.
                    </p>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setTab("billing")}>
                      View Plans &amp; Pay with Paystack
                    </button>
                  </div>
                )}

                <hr className="divider" />

                <form onSubmit={redeemVoucher} style={{ display: "grid", gap: 8 }}>
                  <label htmlFor="redeemVoucher" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>
                    Have a voucher or redeem code?
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="redeemVoucher"
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                      placeholder="CT-RDM-XXXX-XXXX"
                      className="hq-search mono"
                      style={{ maxWidth: "none" }}
                    />
                    <button type="submit" className="btn btn--ghost btn--sm">Redeem</button>
                  </div>
                </form>
              </section>

              <section className="card">
                <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>School Profile</h2>
                <dl className="dl">
                  <div><dt>School</dt><dd>{account.school?.school_name || "-"}</dd></div>
                  <div>
                    <dt>Online Portal School ID</dt>
                    <dd style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <code className="mono" style={{ fontWeight: 700, fontSize: 14 }}>
                        {account.school?.school_code || "-"}
                      </code>
                      {account.school?.school_code ? (
                        <button type="button" className="btn btn--ghost btn--xs" onClick={() => copyText(account.school!.school_code!, "school-code")}>
                          {copiedId === "school-code" ? "Copied" : "Copy"}
                        </button>
                      ) : null}
                      <button type="button" className="btn btn--primary btn--xs" onClick={() => setTab("portal")}>
                        {account.school?.online_portal_enabled ? "Portal Live" : "Turn On Portal"}
                      </button>
                    </dd>
                  </div>
                  <div><dt>Account email</dt><dd className="mono" style={{ fontSize: 12.5 }}>{account.user.email}</dd></div>
                  <div><dt>Account status</dt><dd><span className="status-txt status-txt--ok">{account.school?.status || account.user.status}</span></dd></div>
                  <div>
                    <dt>Last cloud backup</dt>
                    <dd className="tnum">
                      {backups?.last_backup_at ? new Date(backups.last_backup_at).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Not yet synced"}
                    </dd>
                  </div>
                  <div>
                    <dt>Your referral code</dt>
                    <dd style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <code className="mono">{account.referral_code || "-"}</code>
                      {account.referral_code ? (
                        <button type="button" className="btn btn--ghost btn--xs" onClick={() => copyText(account.referral_code!, "ref-code")}>
                          {copiedId === "ref-code" ? "Copied" : "Copy"}
                        </button>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}

          {tab === "portal" ? (
            <div style={{ display: "grid", gap: 18 }}>
              <PortalPowerDial onSynced={() => void loadAll()} />
              <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16 }}>Online Exam Administration</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
                    Teachers and students sign in at <strong>portal.cognitara.net</strong> with School ID{" "}
                    <code className="mono">{account.school?.school_code || "-"}</code> using their exact offline passwords.
                  </p>
                </div>
                <div className="hq-btn-row">
                  <Link
                    href={account.school?.school_code ? `/portal?school=${encodeURIComponent(account.school.school_code)}` : "/portal"}
                    className="btn btn--primary btn--sm"
                    target="_blank"
                  >
                    Open Online Exam Portal
                  </Link>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "billing" ? (
            <div style={{ display: "grid", gap: 22 }}>
              <section className="card">
                <div className="hq-toolbar">
                  <div>
                    <h2 style={{ margin: 0, fontSize: 17 }}>Choose a School Plan</h2>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
                      Pay securely via Paystack (Card, Bank Transfer, or USSD). Your licence activates right after payment.
                      {account.directives?.paystack_mode === "test" ? <span className="tag-test">Test mode</span> : null}
                    </p>
                  </div>
                  <div className="hq-btn-row">
                    <div className="hq-chips">
                      <button type="button" className={`hq-chip ${currency === "NGN" ? "is-active" : ""}`} onClick={() => setCurrency("NGN")}>NGN (₦)</button>
                      <button type="button" className={`hq-chip ${currency === "USD" ? "is-active" : ""}`} onClick={() => setCurrency("USD")}>USD ($)</button>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                  <input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Have a discount code?"
                    className="hq-search mono"
                    style={{ maxWidth: 260 }}
                  />
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void applyPromoCode()}>
                    Apply code
                  </button>
                  {appliedPromo ? (
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => { setAppliedPromo(null); setPromoCode(""); }}
                    >
                      Remove {appliedPromo.code}
                    </button>
                  ) : null}
                </div>

                <div className="cl-plans-grid">
                  {plans.map((p, idx) => {
                    const origMinor = currency === "USD" ? p.price_usd_cents : p.price_ngn_kobo;
                    const discMinor = computeDiscountedMinor(origMinor);
                    const feeInfo = estimateAddedFee(discMinor, currency, account.directives);
                    const totalMinor = discMinor + feeInfo.feeMinor;
                    const highlights = p.features_json?.highlights || [];
                    const featured = Boolean(p.badge && /popular|best/i.test(p.badge)) || p.slug === "annual" || p.slug === "termly";

                    return (
                      <article key={p.id} className={`cl-plan-card ${featured ? "is-featured" : ""}`}>
                        <div className="cl-plan-head">
                          <PlanEmblem slug={p.slug} index={idx} />
                          {p.badge ? <span className="cl-plan-tag">{p.badge}</span> : null}
                        </div>
                        <h3 className="cl-plan-name">{p.display_name}</h3>
                        <p className="cl-plan-desc">
                          {p.duration_days
                            ? `${p.duration_days}-day institutional licence · ${feeInfo.note}`
                            : `Perpetual one-time school licence · ${feeInfo.note}`}
                        </p>

                        <div className="cl-plan-price-row">
                          <div className="cl-plan-price">
                            {discMinor < origMinor ? (
                              <span className="cl-plan-strike">{fmtMoney(origMinor, currency)}</span>
                            ) : null}
                            {fmtMoney(totalMinor, currency)}
                          </div>
                          <div className="cl-plan-cadence">
                            <span>{p.duration_days ? `${currency} / ${p.duration_days}d` : `${currency} / perpetual`}</span>
                            <span>{p.lease_days || 14}d offline lease</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={`cl-plan-cta ${featured ? "cl-plan-cta--solid" : "cl-plan-cta--soft"}`}
                          disabled={busyPlanId === p.id}
                          onClick={() => void buyPlan(p.id)}
                        >
                          {busyPlanId === p.id ? "Opening Paystack…" : `Pay ${fmtMoney(totalMinor, currency)}`}
                        </button>
                        <div className="cl-plan-note">Instant Ed25519 activation · Works offline</div>

                        <div className="cl-plan-divider" />
                        <ul className="cl-plan-feats">
                          {(highlights.length > 0
                            ? highlights.slice(0, 4)
                            : [
                                p.duration_days ? `${p.duration_days} days full CBT server access` : "Perpetual licence with zero renewals",
                                "Unlimited students, exams & question banks",
                                "Encrypted CogniTara Cloud backups",
                              ]
                          ).map((h, i) => (
                            <li key={i}>
                              <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="card">
                <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Payment History &amp; Receipts</h2>
                {payments.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--ink-2)" }}>No payments yet. Your receipts will appear here immediately after checkout.</p>
                ) : (
                  <div className="hq-table-wrap">
                    <table className="hq-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Plan</th>
                          <th>Amount</th>
                          <th>Method</th>
                          <th>Status</th>
                          <th>Date</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.map((pay) => (
                          <tr key={pay.id}>
                            <td className="mono" style={{ fontSize: 12 }}>{pay.paystack_reference}</td>
                            <td>
                              {pay.plan_name}
                              {pay.promo_code_text ? <div className="mono" style={{ fontSize: 11, color: "var(--ok)" }}>{pay.promo_code_text}</div> : null}
                            </td>
                            <td className="mono">{fmtMoney(pay.customer_paid_minor || pay.amount_minor, pay.currency)}</td>
                            <td>
                              {pay.paystack_sub_channel ? `Paystack · ${pay.paystack_sub_channel}` : pay.payment_channel === "redeem_code" ? "100% Code" : "Paystack"}
                              {pay.is_test ? <span className="tag-test">Test</span> : null}
                            </td>
                            <td>
                              <span className={`status-txt ${pay.status === "success" ? "status-txt--ok" : pay.status === "failed" || pay.status === "refunded" ? "status-txt--bad" : "status-txt--warn"}`}>
                                {pay.status === "success" ? "Paid" : pay.status === "initialized" ? "Not finished" : pay.status}
                              </span>
                            </td>
                            <td className="tnum" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                              {new Date(pay.paid_at || pay.created_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
                                <Link href={`/pay/done?reference=${encodeURIComponent(pay.paystack_reference)}`} className="btn btn--ghost btn--xs">
                                  Receipt
                                </Link>
                                {pay.status === "success" ? (
                                  <a
                                    href={`/api/v1/payments/receipt/${encodeURIComponent(pay.paystack_reference)}/pdf`}
                                    download={`CogniTara-Receipt-${pay.paystack_reference}.pdf`}
                                    className="btn btn--outline btn--xs"
                                  >
                                    PDF
                                  </a>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}

          {tab === "referrals" ? (
            <div style={{ display: "grid", gap: 18 }}>
              <div className="hq-kpi-strip">
                <div className="hq-kpi">
                  <span className="hq-kpi__lbl">Schools invited</span>
                  <span className="hq-kpi__val">{referrals?.stats.schools_signed_up || 0}</span>
                  <span className="hq-kpi__sub">{referrals?.stats.paid_conversions || 0} paid subscriptions</span>
                </div>
                <div className="hq-kpi">
                  <span className="hq-kpi__lbl">Available wallet</span>
                  <span className="hq-kpi__val" style={{ color: "var(--ok)" }}>{fmtMoney(referrals?.stats.wallet_balance_minor || 0, "NGN")}</span>
                  <span className="hq-kpi__sub">Total earned: {fmtMoney(referrals?.stats.total_earned_minor || 0, "NGN")}</span>
                </div>
                <div className="hq-kpi">
                  <span className="hq-kpi__lbl">Bonus licence days</span>
                  <span className="hq-kpi__val">+{referrals?.stats.total_bonus_days || 0}d</span>
                  <span className="hq-kpi__sub">Added automatically to your licence</span>
                </div>
              </div>

              <div className="dash-grid">
                <section className="card">
                  <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Share your school referral link</h2>
                  <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-2)" }}>
                    Earn <strong>{referrals?.referral?.commission_pct ?? 15}% cash commission</strong> and{" "}
                    <strong>+{referrals?.referral?.bonus_days ?? 14} free licence days</strong> whenever another school subscribes with your link. They also get free bonus days on their first plan.
                  </p>
                  {referrals?.referral ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>Shareable registration link</div>
                        <div className="copy-box">
                          <code className="mono">{referrals.referral.share_url}</code>
                          <button type="button" className="btn btn--primary btn--xs" onClick={() => copyText(referrals.referral!.share_url, "ref-link")}>
                            {copiedId === "ref-link" ? "Copied" : "Copy link"}
                          </button>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>Referral code</div>
                        <div className="copy-box">
                          <code className="mono">{referrals.referral.referral_code}</code>
                          <button type="button" className="btn btn--ghost btn--xs" onClick={() => copyText(referrals.referral!.referral_code, "ref-c2")}>
                            {copiedId === "ref-c2" ? "Copied" : "Copy code"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="card">
                  <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Request Cash Payout</h2>
                  <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-2)" }}>
                    Withdraw available referral earnings directly to your Nigerian bank account (minimum ₦2,000).
                  </p>
                  <form className="form-grid" onSubmit={submitPayout}>
                    <div className="field">
                      <label htmlFor="pAmt">Amount (₦)</label>
                      <input id="pAmt" type="number" min={2000} required value={payoutAmt} onChange={(e) => setPayoutAmt(e.target.value)} placeholder="5000" />
                    </div>
                    <div className="form-row">
                      <div className="field">
                        <label htmlFor="pBank">Bank name</label>
                        <input id="pBank" required value={payoutBank} onChange={(e) => setPayoutBank(e.target.value)} placeholder="GTBank / Access / OPay" />
                      </div>
                      <div className="field">
                        <label htmlFor="pAcct">Account number</label>
                        <input id="pAcct" className="mono" required value={payoutAcct} onChange={(e) => setPayoutAcct(e.target.value.replace(/\D/g, "").slice(0, 12))} placeholder="0123456789" />
                      </div>
                    </div>
                    <button type="submit" className="btn btn--primary" disabled={payoutBusy || (referrals?.stats.wallet_balance_minor || 0) < 200000}>
                      {payoutBusy ? "Submitting…" : "Request payout"}
                    </button>
                  </form>
                </section>
              </div>

              {(referrals?.conversions?.length || 0) > 0 ? (
                <section className="card">
                  <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Referral Conversions</h2>
                  <div className="hq-table-wrap">
                    <table className="hq-table">
                      <thead>
                        <tr><th>School</th><th>Cash earned</th><th>Bonus days</th><th>Status</th><th>Date</th></tr>
                      </thead>
                      <tbody>
                        {referrals!.conversions.map((c) => (
                          <tr key={c.id}>
                            <td>{c.referred_school_name}</td>
                            <td className="mono">{fmtMoney(c.commission_amount_kobo, "NGN")}</td>
                            <td className="mono">+{c.bonus_days_granted_referrer}d</td>
                            <td><span className={`status-txt ${c.status === "credited" ? "status-txt--ok" : "status-txt--bad"}`}>{c.status}</span></td>
                            <td className="tnum" style={{ fontSize: 12.5 }}>{new Date(c.created_at).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "backups" ? (
            <section className="card">
              <div className="hq-toolbar">
                <div>
                  <h2 style={{ margin: 0, fontSize: 17 }}>Cloud Exam Database Backups</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-2)" }}>
                    Backups uploaded from CogniTara Studio are compressed and stored safely here (up to 10 snapshots kept). Reminder schedule: every{" "}
                    <strong>{backups?.backup_reminder_days || 7} days</strong>.
                  </p>
                </div>
              </div>

              {!backups?.backups?.length ? (
                <div style={{ padding: "24px 0", color: "var(--ink-2)" }}>
                  No cloud backups uploaded yet. Open <strong>CogniTara Studio → Backups → Back up to Cloud</strong> on your school exam server to upload your first snapshot.
                </div>
              ) : (
                <div className="hq-table-wrap">
                  <table className="hq-table">
                    <thead>
                      <tr>
                        <th>Snapshot</th>
                        <th>Contents</th>
                        <th>Size</th>
                        <th>Uploaded</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.backups.map((b) => (
                        <tr key={b.id}>
                          <td>
                            <strong>{b.label || b.filename}</strong>
                            <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{b.filename}</div>
                          </td>
                          <td style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                            {b.stats_json?.exams !== undefined
                              ? `${b.stats_json.exams} exams · ${b.stats_json.questions || 0} questions · ${b.stats_json.students || 0} students`
                              : "Full exam SQLite database"}
                          </td>
                          <td className="mono" style={{ fontSize: 12.5 }}>{fmtBytes(b.compressed_bytes)}</td>
                          <td className="tnum" style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                            {new Date(b.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
                              <a href={`/api/v1/backups/${encodeURIComponent(b.id)}/download`} className="btn btn--ghost btn--xs">
                                Download
                              </a>
                              <button type="button" className="btn btn--danger btn--xs" onClick={() => void deleteBackup(b.id)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </main>
      )}
    </div>
  );
}
