"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";

interface AccountPayload {
  ok: boolean;
  user: { id: string; email: string; full_name: string; phone: string; role: string; status: string };
  school: { id: string; school_name: string; country_code: string; status: string } | null;
  referral_code: string | null;
  licenses: Array<{ id: string; license_key: string; plan_tier: string; plan_name?: string; status: string; expires_at: string | null }>;
  directives?: { global_announcement?: string; school_notice?: string };
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
}

const RELEASES_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

function fmtNgn(kobo: number) {
  return `₦${(Number(kobo || 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  async function loadAll() {
    const [meRes, plansRes] = await Promise.all([
      fetch("/api/v1/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/v1/plans").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!meRes || !meRes.ok) {
      router.replace("/signin");
      return;
    }
    setAccount(meRes);
    if (plansRes?.ok && Array.isArray(plansRes.plans)) setPlans(plansRes.plans);
    setLoading(false);
  }

  useEffect(() => {
    void loadAll().then(async () => {
      const ref = new URLSearchParams(window.location.search).get("paystack_ref");
      if (ref) {
        setMsg({ kind: "ok", text: `Verifying Paystack payment ${ref}…` });
        const vr = await fetch("/api/v1/payments/paystack/verify", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref }),
        }).then((r) => r.json()).catch(() => null);
        if (vr?.ok) {
          setMsg({ kind: "ok", text: `Payment verified! Your new licence key is ${vr.license?.license_key || "issued"}.` });
          window.history.replaceState({}, "", "/dashboard");
          await loadAll();
        } else {
          setMsg({ kind: "bad", text: vr?.message || "Could not verify payment yet." });
        }
      }
    });
  }, []);

  async function handleSignOut() {
    await fetch("/api/v1/auth/signout", { method: "POST", credentials: "include" });
    router.push("/signin");
  }

  function copyText(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function buyPlan(planId: string) {
    setMsg(null);
    setBusyPlanId(planId);
    try {
      const res = await fetch("/api/v1/payments/paystack/initialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, currency: "NGN", promo_code: promoCode.trim() || undefined }),
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
      body: JSON.stringify({ code: redeemCode.trim().toUpperCase() }),
    }).then((r) => r.json());
    if (res?.ok) {
      setRedeemCode("");
      setMsg({ kind: "ok", text: `${res.message} Key: ${res.license?.license_key}` });
      await loadAll();
    } else {
      setMsg({ kind: "bad", text: res?.message || "Redeem code failed." });
    }
  }

  const isHq = account?.user.role === "hq_super_admin" || account?.user.role === "hq_admin";

  return (
    <div className="ct-shell">
      <BrandHeader signedIn={Boolean(account)} isHq={isHq} />
      {loading || !account ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <p style={{ color: "var(--ink-2)" }}>Loading your CogniTara Cloud account…</p>
        </div>
      ) : (
        <main>
          {msg ? <div className={`alert alert--${msg.kind}`}>{msg.text}</div> : null}
          {account.directives?.school_notice || account.directives?.global_announcement ? (
            <div className="alert alert--warn">
              <strong>CogniTara HQ:</strong> {account.directives.school_notice || account.directives.global_announcement}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div>
              <span className="hq-eyebrow">Cloud School Workspace</span>
              <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.025em" }}>
                {account.school?.school_name || account.user.full_name}
              </h1>
              <p style={{ margin: "4px 0 0", color: "var(--ink-2)" }}>
                Signed in as {account.user.full_name} ({account.user.email})
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {isHq ? (
                <Link href="/hq" className="btn btn--primary">
                  Open Developer HQ Console →
                </Link>
              ) : null}
              <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className={isHq ? "btn btn--ghost" : "btn btn--primary"}>
                Download Desktop App
              </a>
              <button type="button" className="btn btn--ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>

          <div className="dash-grid">
            <section className="card">
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>School Profile &amp; Sync</h2>
              <dl className="dl">
                <div><dt>School Name</dt><dd>{account.school?.school_name || "—"}</dd></div>
                <div><dt>Account Email</dt><dd className="mono">{account.user.email}</dd></div>
                <div><dt>Role</dt><dd className="mono">{account.user.role}</dd></div>
                <div><dt>Status</dt><dd><span className="pill pill--ok">{account.user.status}</span></dd></div>
                <div>
                  <dt>Referral Code</dt>
                  <dd style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code className="mono">{account.referral_code || "—"}</code>
                    {account.referral_code ? (
                      <button type="button" className="btn btn--ghost btn--xs" onClick={() => copyText(account.referral_code!)}>
                        {copied ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card">
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Your CogniTara Licences</h2>
              {account.licenses.length === 0 ? (
                <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
                  No paid licence linked yet. Purchase a plan below via Paystack or redeem a voucher code — your key syncs straight to CogniTara Studio Desktop.
                </p>
              ) : (
                <dl className="dl">
                  {account.licenses.map((lic) => (
                    <div key={lic.id}>
                      <dt className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{lic.license_key}</dt>
                      <dd style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="pill">{lic.plan_name || lic.plan_tier}</span>
                        <span className={`pill ${lic.status === "revoked" ? "pill--bad" : "pill--ok"}`}>{lic.status}</span>
                        <button type="button" className="btn btn--ghost btn--xs" onClick={() => copyText(lic.license_key)}>Copy</button>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              <form onSubmit={redeemVoucher} style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <input
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  placeholder="Redeem voucher code (CT-RDM-...)"
                  className="hq-search mono"
                  style={{ maxWidth: "none" }}
                />
                <button type="submit" className="btn btn--ghost btn--sm">Redeem</button>
              </form>
            </section>
          </div>

          {plans.length > 0 ? (
            <section className="card" style={{ marginTop: 20 }}>
              <div className="hq-toolbar">
                <div>
                  <h2 style={{ margin: 0, fontSize: 16 }}>Purchase or Upgrade via Paystack</h2>
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--ink-3)" }}>
                    Instant Ed25519 licence delivery synced automatically to your Windows exam server.
                  </p>
                </div>
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Promo / discount code (optional)"
                  className="hq-search mono"
                  style={{ maxWidth: 240 }}
                />
              </div>
              <div className="ct-grid3" style={{ marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {plans.map((p) => (
                  <div key={p.id} className="card card--sm" style={{ background: "var(--field)", display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{p.display_name}</strong>
                      {p.badge ? <span className="pill pill--accent">{p.badge}</span> : null}
                    </div>
                    <div className="mono" style={{ fontSize: 22, fontWeight: 740 }}>{fmtNgn(p.price_ngn_kobo)}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                      {p.duration_days ? `${p.duration_days} days · ${p.lease_days}d offline lease` : `Perpetual · ${p.lease_days}d offline lease`}
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={busyPlanId === p.id}
                      onClick={() => buyPlan(p.id)}
                    >
                      {busyPlanId === p.id ? "Opening Paystack…" : "Pay with Paystack"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </main>
      )}
    </div>
  );
}
