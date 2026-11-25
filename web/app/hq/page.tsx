"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TabKey = "overview" | "users" | "purchases" | "plans" | "codes" | "settings" | "audit";

function fmtNgn(kobo: number) {
  return `₦${(Number(kobo || 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}
function fmtUsd(cents: number) {
  return `$${(Number(cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMoney(minor: number, currency: string) {
  return String(currency || "NGN").toUpperCase() === "USD" ? fmtUsd(minor) : fmtNgn(minor);
}
function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(iso);
  }
}

export default function DeveloperHqPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [tab, setTab] = useState<TabKey>("overview");
  const [authState, setAuthState] = useState<"checking" | "signed_out" | "ready">("checking");
  const [hqUser, setHqUser] = useState<{ email: string; full_name: string; role: string } | null>(null);

  // HQ Login state
  const [loginEmail, setLoginEmail] = useState("founder@cognitara.net");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 4200);
  }, []);

  // Live data slices
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [selectedSchool, setSelectedSchool] = useState<any | null>(null);

  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState("all");

  const [plans, setPlans] = useState<any[]>([]);
  const [editingPlan, setEditingPlan] = useState<any>({
    id: "",
    display_name: "",
    slug: "",
    badge: "",
    description: "",
    billing_cycle: "annual",
    plan_tier: "annual",
    duration_days: "365",
    lease_days: "30",
    price_ngn: "220000",
    price_usd: "179",
    max_devices: "1",
    sort_order: "5",
    highlights: "Up to 300 concurrent students\nOffline lease resilience\nAutomatic backups",
    is_active: true,
  });

  const [codes, setCodes] = useState<any[]>([]);
  const [codeForm, setCodeForm] = useState({
    code_type: "discount",
    code: "",
    prefix: "SAVE",
    batch_count: "1",
    discount_kind: "percent",
    discount_value: "20",
    grant_plan_id: "",
    grant_duration_days: "",
    max_uses: "50",
    per_school_limit: "1",
    expires_at: "",
    notes: "",
  });
  const [lastBatchCodes, setLastBatchCodes] = useState<string[]>([]);

  const [settingsForm, setSettingsForm] = useState<any>({
    paystack_public_key: "",
    paystack_secret_key: "",
    paystack_secret_masked: "",
    paystack_secret_configured: false,
    paystack_mode: "test",
    brevo_api_key: "",
    brevo_api_key_masked: "",
    brevo_configured: false,
    brevo_sender_email: "noreply@cognitara.net",
    brevo_sender_name: "CogniTara Cloud",
    require_email_otp: false,
    default_currency: "NGN",
    maintenance_mode: false,
    maintenance_message: "",
    min_desktop_version: "2.0.0",
    global_announcement: "",
    global_announcement_level: "info",
    allow_self_signup: true,
    allow_paystack_checkout: true,
    allow_trial_activation: true,
    webhook_url: "",
    ed25519_public_key: "",
  });
  const [brevoTestEmail, setBrevoTestEmail] = useState("");
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Power Drawer action states
  const [pwPlanId, setPwPlanId] = useState("");
  const [pwCustomDays, setPwCustomDays] = useState("");
  const [pwExtendDays, setPwExtendDays] = useState("30");
  const [pwNotice, setPwNotice] = useState("");
  const [pwNoticeLevel, setPwNoticeLevel] = useState("info");
  const [pwReason, setPwReason] = useState("");
  const [pwTempPass, setPwTempPass] = useState("");
  const [pwOverridesText, setPwOverridesText] = useState("{}");
  const [busyAction, setBusyAction] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramTheme = params.get("theme");
    const saved = paramTheme === "light" || paramTheme === "dark"
      ? paramTheme
      : (localStorage.getItem("ct-cloud-theme") as "dark" | "light" | null) || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("ct-cloud-theme", next);
  }

  const refreshAll = useCallback(async () => {
    const ovRes = await fetch("/api/v1/hq/overview", { credentials: "include" });
    if (ovRes.status === 401 || ovRes.status === 403) {
      setAuthState("signed_out");
      return;
    }
    const ov = await ovRes.json();
    if (!ov?.ok) {
      setAuthState("signed_out");
      return;
    }
    setHqUser(ov.hq_user);
    setOverview(ov);
    setAuthState("ready");

    const [uRes, pRes, plRes, cRes, sRes, aRes] = await Promise.all([
      fetch("/api/v1/hq/users", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/purchases", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/plans", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/codes", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/settings", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/audit", { credentials: "include" }).then((r) => r.json()).catch(() => null),
    ]);
    if (uRes?.ok) setUsers(uRes.users || []);
    if (pRes?.ok) setPurchases(pRes.purchases || []);
    if (plRes?.ok) {
      const list = plRes.plans || [];
      setPlans(list);
      if (list.length) {
        setPwPlanId((prev) => prev || list[0].id);
        setCodeForm((prev) => (prev.grant_plan_id ? prev : { ...prev, grant_plan_id: list[0].id }));
      }
    }
    if (cRes?.ok) setCodes(cRes.codes || []);
    if (sRes?.ok && sRes.settings) {
      setSettingsForm((prev: any) => ({
        ...prev,
        ...sRes.settings,
        paystack_secret_key: "",
        brevo_api_key: "",
      }));
    }
    if (aRes?.ok) setAuditLogs(aRes.logs || []);
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  async function handleHqSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr("");
    setLoginBusy(true);
    try {
      const res = await fetch("/api/v1/auth/signin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPass, client_type: "web" }),
      }).then((r) => r.json());
      if (!res?.ok) {
        setLoginErr(res?.message || "Invalid credentials.");
        return;
      }
      if (res.user?.role !== "hq_super_admin" && res.user?.role !== "hq_admin") {
        setLoginErr("This account does not have Developer HQ Super-Admin privileges.");
        return;
      }
      setLoginPass("");
      await refreshAll();
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/v1/auth/signout", { method: "POST", credentials: "include" });
    setAuthState("signed_out");
    setHqUser(null);
  }

  function openPowerDrawer(u: any) {
    setSelectedSchool(u);
    setPwNotice(u.custom_notice || "");
    setPwNoticeLevel(u.custom_notice_level || "info");
    setPwReason("");
    setPwTempPass("");
    setPwOverridesText(JSON.stringify(u.feature_overrides_json || {}, null, 2));
  }

  async function runSchoolPowerAction(action: string, extra: Record<string, unknown> = {}) {
    if (!selectedSchool) return;
    setBusyAction(true);
    try {
      const res = await fetch(`/api/v1/hq/users/${selectedSchool.school_id}/action`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: pwReason || "Developer HQ Power Action", ...extra }),
      }).then((r) => r.json());
      if (!res?.ok) {
        showToast(`Error: ${res?.message || "Action failed"}`);
        return;
      }
      if (res.temporary_password) setPwTempPass(res.temporary_password);
      showToast(res.message || "Action executed.");
      await refreshAll();
      if (action === "delete_school") {
        setSelectedSchool(null);
      } else {
        const refreshed = await fetch("/api/v1/hq/users", { credentials: "include" }).then((r) => r.json()).catch(() => null);
        if (refreshed?.ok) {
          const match = (refreshed.users || []).find((x: any) => x.school_id === selectedSchool.school_id);
          if (match) setSelectedSchool(match);
        }
      }
    } finally {
      setBusyAction(false);
    }
  }

  async function runPurchaseAction(paymentId: string, action: string) {
    const res = await fetch("/api/v1/hq/purchases", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_id: paymentId, action }),
    }).then((r) => r.json());
    showToast(res?.message || (res?.ok ? "Updated order." : "Action failed."));
    await refreshAll();
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/v1/hq/plans", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingPlan),
    }).then((r) => r.json());
    showToast(res?.message || (res?.ok ? "Plan saved." : "Error saving plan."));
    if (res?.ok) {
      setEditingPlan({
        id: "",
        display_name: "",
        slug: "",
        badge: "",
        description: "",
        billing_cycle: "annual",
        plan_tier: "annual",
        duration_days: "365",
        lease_days: "30",
        price_ngn: "100000",
        price_usd: "79",
        max_devices: "1",
        sort_order: "10",
        highlights: "",
        is_active: true,
      });
      await refreshAll();
    }
  }

  async function deletePlan(id: string) {
    const res = await fetch(`/api/v1/hq/plans?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" }).then((r) => r.json());
    showToast(res?.message || "Plan updated.");
    await refreshAll();
  }

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/v1/hq/codes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(codeForm),
    }).then((r) => r.json());
    showToast(res?.message || (res?.ok ? "Code created." : "Failed."));
    if (res?.ok) {
      setLastBatchCodes((res.created || []).map((c: any) => c.code));
      setCodeForm((prev) => ({ ...prev, code: "" }));
      await refreshAll();
    }
  }

  async function toggleCode(id: string) {
    const res = await fetch("/api/v1/hq/codes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle", id }),
    }).then((r) => r.json());
    showToast(res?.message || "Code toggled.");
    await refreshAll();
  }

  async function deleteCode(id: string) {
    const res = await fetch(`/api/v1/hq/codes?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" }).then((r) => r.json());
    showToast(res?.message || "Code deleted.");
    await refreshAll();
  }

  async function savePlatformSettings(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...settingsForm };
    if (!payload.paystack_secret_key) delete payload.paystack_secret_key;
    const res = await fetch("/api/v1/hq/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.json());
    showToast(res?.message || (res?.ok ? "Settings saved." : "Error saving settings."));
    if (res?.ok) await refreshAll();
  }

  async function testPaystackConnection() {
    const res = await fetch("/api/v1/hq/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "paystack" }),
    }).then((r) => r.json());
    showToast(res?.message || "Test finished.");
  }

  async function testBrevoConnection(sendEmail = false) {
    const res = await fetch("/api/v1/hq/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "brevo",
        test_email: sendEmail ? brevoTestEmail.trim() : undefined,
      }),
    }).then((r) => r.json());
    showToast(res?.message || "Brevo check finished.");
  }

  // ---- AUTH GATE ----
  if (authState === "checking") {
    return (
      <div className="ct-shell" style={{ paddingTop: 90, textAlign: "center", color: "var(--ink-2)" }}>
        Authenticating CogniTara Developer HQ…
      </div>
    );
  }

  if (authState === "signed_out") {
    return (
      <div className="ct-shell" style={{ paddingTop: 56 }}>
        <div className="auth-wrap">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <Link href="/" className="ct-brand">
              <span className="ct-brand__name">Cogni<em>Tara</em></span>
              <span className="ct-brand__tag">DEVELOPER HQ</span>
            </Link>
            <button type="button" className="btn btn--ghost btn--sm" onClick={toggleTheme}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </div>
          <div className="card">
            <div className="auth-head">
              <span className="hq-eyebrow">Restricted Super-Admin Console</span>
              <h1>Developer HQ Sign In</h1>
              <p>Sign in with your HQ Super-Admin account to manage Paystack keys, plans, codes, purchases, and remote controls.</p>
            </div>
            {loginErr ? <div className="alert alert--bad">{loginErr}</div> : null}
            <form className="form-grid" onSubmit={handleHqSignIn}>
              <div className="field">
                <label>HQ Super-Admin Email</label>
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required placeholder="Enter HQ password" />
              </div>
              <button type="submit" className="btn btn--primary btn--lg" disabled={loginBusy}>
                {loginBusy ? "Verifying clearance…" : "Enter Developer Command Center"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const m = overview?.metrics || {};
  const filteredUsers = users.filter((u) => {
    if (userStatusFilter !== "all" && u.school_status !== userStatusFilter) return false;
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      String(u.school_name || "").toLowerCase().includes(q) ||
      String(u.full_name || "").toLowerCase().includes(q) ||
      String(u.email || "").toLowerCase().includes(q) ||
      String(u.license_key || "").toLowerCase().includes(q)
    );
  });

  const filteredPurchases = purchases.filter((p) => {
    if (purchaseStatusFilter !== "all" && p.status !== purchaseStatusFilter) return false;
    if (!purchaseSearch.trim()) return true;
    const q = purchaseSearch.toLowerCase();
    return (
      String(p.paystack_reference || "").toLowerCase().includes(q) ||
      String(p.school_name || "").toLowerCase().includes(q) ||
      String(p.email || "").toLowerCase().includes(q) ||
      String(p.license_key || "").toLowerCase().includes(q) ||
      String(p.promo_code_text || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="hq-layout">
      {/* LEFT SIDEBAR */}
      <aside className="hq-side">
        <div className="hq-side__brand">
          <Link href="/" className="ct-brand">
            <span className="ct-brand__icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 200 200">
                <path fill="#FFFFFF" d="M 150.91,150.91 C 122.79,179.03 77.21,179.03 49.09,150.91 C 20.97,122.79 20.97,77.21 49.09,49.09 C 77.21,20.97 122.79,20.97 150.91,49.09 L 131.11,68.89 C 113.93,51.70 86.07,51.70 68.89,68.89 C 51.70,86.07 51.70,113.93 68.89,131.11 C 86.07,148.30 113.93,148.30 131.11,131.11 Z" />
                <path fill="#3B82F6" d="M 108.00,74.00 C 115.00,93.00 115.00,93.00 146.00,100.00 C 115.00,107.00 115.00,107.00 108.00,126.00 C 101.00,107.00 101.00,107.00 90.00,100.00 C 101.00,93.00 101.00,93.00 108.00,74.00 Z" />
              </svg>
            </span>
            <div>
              <div className="ct-brand__name" style={{ fontSize: 15 }}>Cogni<em>Tara</em></div>
              <div className="ct-brand__tag" style={{ fontSize: 9.5 }}>DEVELOPER HQ</div>
            </div>
          </Link>
        </div>

        <div className="hq-side__group">
          <div className="hq-side__label">Command</div>
          <button type="button" className={`hq-nav-btn ${tab === "overview" ? "is-active" : ""}`} onClick={() => setTab("overview")}>
            <span>Overview</span>
          </button>
          <button type="button" className={`hq-nav-btn ${tab === "users" ? "is-active" : ""}`} onClick={() => setTab("users")}>
            <span>Users &amp; Power Controls</span>
            <span className="hq-nav-btn__cnt">{users.length}</span>
          </button>
          <button type="button" className={`hq-nav-btn ${tab === "purchases" ? "is-active" : ""}`} onClick={() => setTab("purchases")}>
            <span>Purchases &amp; Ledger</span>
            <span className="hq-nav-btn__cnt">{purchases.length}</span>
          </button>
        </div>

        <div className="hq-side__group">
          <div className="hq-side__label">Monetization</div>
          <button type="button" className={`hq-nav-btn ${tab === "plans" ? "is-active" : ""}`} onClick={() => setTab("plans")}>
            <span>Plans &amp; Pricing</span>
            <span className="hq-nav-btn__cnt">{plans.length}</span>
          </button>
          <button type="button" className={`hq-nav-btn ${tab === "codes" ? "is-active" : ""}`} onClick={() => setTab("codes")}>
            <span>Redeem &amp; Discount Codes</span>
            <span className="hq-nav-btn__cnt">{codes.length}</span>
          </button>
        </div>

        <div className="hq-side__group">
          <div className="hq-side__label">Control &amp; Security</div>
          <button type="button" className={`hq-nav-btn ${tab === "settings" ? "is-active" : ""}`} onClick={() => setTab("settings")}>
            <span>Paystack &amp; Kill-Switches</span>
          </button>
          <button type="button" className={`hq-nav-btn ${tab === "audit" ? "is-active" : ""}`} onClick={() => setTab("audit")}>
            <span>Security Audit Log</span>
            <span className="hq-nav-btn__cnt">{auditLogs.length}</span>
          </button>
        </div>

        <div className="hq-side__foot">
          <div style={{ fontSize: 12, color: "var(--ink-3)", padding: "0 4px" }}>
            <strong style={{ display: "block", color: "var(--ink)" }}>{hqUser?.full_name}</strong>
            <span className="mono" style={{ fontSize: 11 }}>{hqUser?.email}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn btn--ghost btn--xs" style={{ flex: 1 }} onClick={toggleTheme}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <button type="button" className="btn btn--ghost btn--xs" style={{ flex: 1 }} onClick={() => void refreshAll()}>
              Refresh
            </button>
            <button type="button" className="btn btn--danger btn--xs" onClick={handleSignOut}>
              Exit
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="hq-main">
        {/* ===== TAB 1: OVERVIEW ===== */}
        {tab === "overview" ? (
          <>
            <header className="hq-head">
              <div>
                <span className="hq-eyebrow">Global Command Telemetry</span>
                <h1>Developer HQ Overview</h1>
                <p>Live Neon Postgres revenue, school installations, Ed25519 licences, and remote platform switches.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTab("codes")}>+ Create Redeem / Promo Code</button>
                <button type="button" className="btn btn--primary btn--sm" onClick={() => setTab("settings")}>Configure Paystack &amp; Broadcast</button>
              </div>
            </header>

            <section className="hq-kpi-strip">
              <div className="hq-kpi">
                <span className="hq-kpi__lbl">Revenue (NGN)</span>
                <span className="hq-kpi__val">{fmtNgn(m.revenue_ngn_kobo)}</span>
                <span className="hq-kpi__sub">USD: {fmtUsd(m.revenue_usd_cents)}</span>
              </div>
              <div className="hq-kpi">
                <span className="hq-kpi__lbl">Paid Orders</span>
                <span className="hq-kpi__val">{m.paid_orders || 0}</span>
                <span className="hq-kpi__sub">{m.pending_orders || 0} pending · {m.refunded_orders || 0} refunded</span>
              </div>
              <div className="hq-kpi">
                <span className="hq-kpi__lbl">Registered Schools</span>
                <span className="hq-kpi__val">{m.schools_total || 0}</span>
                <span className="hq-kpi__sub">{m.schools_seen_24h || 0} active 24h · {m.schools_banned || 0} banned</span>
              </div>
              <div className="hq-kpi">
                <span className="hq-kpi__lbl">Active Licences</span>
                <span className="hq-kpi__val">{m.licenses_active || 0}</span>
                <span className="hq-kpi__sub">{m.licenses_revoked || 0} revoked · {m.active_devices_24h || 0} live PCs</span>
              </div>
              <div className="hq-kpi">
                <span className="hq-kpi__lbl">Code Redemptions</span>
                <span className="hq-kpi__val">{m.promo_redemptions || 0}</span>
                <span className="hq-kpi__sub">{m.promo_codes_active || 0} active codes</span>
              </div>
            </section>

            <div className="card card--sm" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13 }}>
                <span>Paystack: <strong className={`pill ${overview?.platform?.paystack_configured ? "pill--ok" : "pill--warn"}`}>
                  {overview?.platform?.paystack_configured ? `READY (${String(overview.platform.paystack_mode).toUpperCase()})` : "KEYS NOT SET"}
                </strong></span>
                <span>Maintenance: <strong className={`pill ${overview?.platform?.maintenance_mode ? "pill--bad" : "pill--ok"}`}>
                  {overview?.platform?.maintenance_mode ? "ACTIVE" : "OFF"}
                </strong></span>
                <span>Min App: <code className="mono">v{overview?.platform?.min_desktop_version || "2.0.0"}</code></span>
                <span>Checkout: <strong className={`pill ${overview?.platform?.allow_paystack_checkout ? "pill--ok" : "pill--warn"}`}>
                  {overview?.platform?.allow_paystack_checkout ? "OPEN" : "PAUSED"}
                </strong></span>
              </div>
              <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTab("settings")}>Edit Switches →</button>
            </div>

            <div className="hq-grid2">
              <section className="card">
                <div className="hq-toolbar">
                  <h2 style={{ margin: 0, fontSize: 15 }}>Recent Purchases &amp; Orders</h2>
                  <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTab("purchases")}>View All</button>
                </div>
                <div className="hq-table-wrap">
                  <table className="hq-table">
                    <thead><tr><th>School</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {(overview?.recent_purchases || []).length === 0 ? (
                        <tr><td colSpan={4} style={{ color: "var(--ink-3)", textAlign: "center", padding: 24 }}>No orders recorded yet.</td></tr>
                      ) : (overview?.recent_purchases || []).map((p: any) => (
                        <tr key={p.id}>
                          <td><strong>{p.school_name}</strong><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{p.email}</div></td>
                          <td>{p.plan_name}<div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{p.payment_channel}</div></td>
                          <td className="mono">{fmtMoney(p.amount_minor, p.currency)}</td>
                          <td><span className={`pill ${p.status === "success" ? "pill--ok" : p.status === "refunded" || p.status === "failed" ? "pill--bad" : "pill--warn"}`}>{p.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <div className="hq-toolbar">
                  <h2 style={{ margin: 0, fontSize: 15 }}>Live Security &amp; Power Audit</h2>
                  <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTab("audit")}>Full Log</button>
                </div>
                <div className="dl">
                  {(overview?.recent_audit || []).slice(0, 8).map((a: any) => (
                    <div key={a.id}>
                      <div>
                        <strong className="mono" style={{ fontSize: 12 }}>{a.action}</strong>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{a.actor_email || "system"} · {a.ip_address || "—"}</div>
                      </div>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{fmtDate(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : null}

        {/* ===== TAB 2: USERS & POWER CONTROLS ===== */}
        {tab === "users" ? (
          <>
            <header className="hq-head">
              <div>
                <span className="hq-eyebrow">Remote Fleet Control</span>
                <h1>All Registered Users &amp; Schools</h1>
                <p>Inspect any school account and execute live remote actions — grant/revoke Ed25519 licences, push desktop notices, reset HWIDs, force sign-outs, or ban accounts.</p>
              </div>
            </header>

            <div className="hq-toolbar">
              <input
                className="hq-search"
                placeholder="Search school, owner, email, licence key, or HWID…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 6 }}>
                {["all", "active", "suspended", "banned"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`btn btn--xs ${userStatusFilter === st ? "btn--primary" : "btn--ghost"}`}
                    onClick={() => setUserStatusFilter(st)}
                  >
                    {st.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="hq-table-wrap">
              <table className="hq-table">
                <thead>
                  <tr>
                    <th>School &amp; Owner</th>
                    <th>Active Licence</th>
                    <th>Telemetry / HWID</th>
                    <th>Spent</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Power Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.school_id}>
                      <td>
                        <strong>{u.school_name}</strong>
                        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{u.full_name} · {u.email}</div>
                        {u.custom_notice ? <div style={{ fontSize: 11, color: "var(--warn)", marginTop: 2 }}>Notice active: {u.custom_notice.slice(0, 48)}</div> : null}
                      </td>
                      <td>
                        {u.license_key ? (
                          <>
                            <code className="mono" style={{ fontSize: 12 }}>{u.license_key}</code>
                            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                              {u.plan_name || u.plan_tier} · <span className={`pill ${u.license_status === "revoked" ? "pill--bad" : "pill--ok"}`}>{u.license_status}</span>
                            </div>
                          </>
                        ) : <span style={{ color: "var(--ink-3)" }}>No paid licence</span>}
                      </td>
                      <td>
                        <div className="mono" style={{ fontSize: 11.5 }}>{u.last_hwid || "No PC bound"}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          {u.last_app_version ? `v${u.last_app_version}` : "Web"} · {u.active_sessions || 0} sessions · {fmtDate(u.last_seen_at)}
                        </div>
                      </td>
                      <td className="mono">{fmtNgn(u.total_paid_ngn)}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{u.orders_count || 0} orders</div></td>
                      <td>
                        <span className={`pill ${u.school_status === "active" ? "pill--ok" : u.school_status === "suspended" ? "pill--warn" : "pill--bad"}`}>
                          {u.school_status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button type="button" className="btn btn--primary btn--xs" onClick={() => openPowerDrawer(u)}>
                          ⚡ Control
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {/* ===== TAB 3: PURCHASES & LEDGER ===== */}
        {tab === "purchases" ? (
          <>
            <header className="hq-head">
              <div>
                <span className="hq-eyebrow">Revenue &amp; Orders Ledger</span>
                <h1>All Purchases &amp; Redemptions</h1>
                <p>Track every Paystack transaction, promo discount, redeem voucher, and HQ manual grant with instant verification &amp; refund revocation.</p>
              </div>
            </header>

            <div className="hq-toolbar">
              <input
                className="hq-search"
                placeholder="Search reference, school, email, licence key, promo code…"
                value={purchaseSearch}
                onChange={(e) => setPurchaseSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 6 }}>
                {["all", "success", "initialized", "failed", "refunded"].map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`btn btn--xs ${purchaseStatusFilter === st ? "btn--primary" : "btn--ghost"}`}
                    onClick={() => setPurchaseStatusFilter(st)}
                  >
                    {st.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="hq-table-wrap">
              <table className="hq-table">
                <thead>
                  <tr>
                    <th>Reference &amp; Date</th>
                    <th>School</th>
                    <th>Plan &amp; Promo</th>
                    <th>Net Paid</th>
                    <th>Licence</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--ink-3)" }}>No matching transactions.</td></tr>
                  ) : filteredPurchases.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <code className="mono" style={{ fontSize: 11.5 }}>{p.paystack_reference}</code>
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{fmtDate(p.paid_at || p.created_at)} · {p.payment_channel}</div>
                      </td>
                      <td><strong>{p.school_name}</strong><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{p.email}</div></td>
                      <td>
                        {p.plan_name}
                        {p.promo_code_text ? <div className="mono" style={{ fontSize: 11, color: "var(--ok)" }}>Code: {p.promo_code_text} (-{fmtMoney(p.discount_amount_minor, p.currency)})</div> : null}
                      </td>
                      <td className="mono" style={{ fontWeight: 700 }}>{fmtMoney(p.amount_minor, p.currency)}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{p.license_key || "—"}</td>
                      <td>
                        <span className={`pill ${p.status === "success" ? "pill--ok" : p.status === "refunded" || p.status === "failed" ? "pill--bad" : "pill--warn"}`}>
                          {p.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          {p.status === "initialized" ? (
                            <>
                              <button type="button" className="btn btn--ghost btn--xs" onClick={() => runPurchaseAction(p.id, "verify_paystack")}>Verify Paystack</button>
                              <button type="button" className="btn btn--ok btn--xs" onClick={() => runPurchaseAction(p.id, "force_fulfill")}>Mark Paid</button>
                            </>
                          ) : null}
                          {p.status === "success" ? (
                            <button type="button" className="btn btn--danger btn--xs" onClick={() => runPurchaseAction(p.id, "mark_refunded")}>Refund + Revoke</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {/* ===== TAB 4: DYNAMIC PLANS MANAGER ===== */}
        {tab === "plans" ? (
          <>
            <header className="hq-head">
              <div>
                <span className="hq-eyebrow">Live Desktop Store Catalog</span>
                <h1>Subscription Plans &amp; Pricing</h1>
                <p>Any plan you create or update here syncs immediately to every CogniTara Studio desktop app&apos;s Paystack store.</p>
              </div>
            </header>

            <div className="hq-grid2">
              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                {plans.map((p) => (
                  <div key={p.id} className="card card--sm" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <strong>{p.display_name}</strong>
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{p.slug}</span>
                        {p.badge ? <span className="pill pill--accent">{p.badge}</span> : null}
                        <span className={`pill ${p.is_active ? "pill--ok" : "pill--warn"}`}>{p.is_active ? "ACTIVE" : "HIDDEN"}</span>
                      </div>
                      <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>
                        {fmtNgn(p.price_ngn_kobo)} · {fmtUsd(p.price_usd_cents)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                        {p.duration_days ? `${p.duration_days} days` : "Perpetual"} · {p.lease_days}d offline lease · {p.max_devices || 1} PC(s) · {p.paid_orders || 0} orders
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn--ghost btn--xs"
                        onClick={() =>
                          setEditingPlan({
                            id: p.id,
                            display_name: p.display_name,
                            slug: p.slug,
                            badge: p.badge || "",
                            description: p.description || "",
                            billing_cycle: p.billing_cycle || "annual",
                            plan_tier: p.plan_tier || "annual",
                            duration_days: p.duration_days ?? "",
                            lease_days: String(p.lease_days || 30),
                            price_ngn: String((Number(p.price_ngn_kobo || 0) / 100)),
                            price_usd: String((Number(p.price_usd_cents || 0) / 100)),
                            max_devices: String(p.max_devices || 1),
                            sort_order: String(p.sort_order ?? 10),
                            highlights: ((p.features_json && p.features_json.highlights) || []).join("\n"),
                            is_active: p.is_active !== false,
                          })
                        }
                      >
                        Edit
                      </button>
                      <button type="button" className="btn btn--danger btn--xs" onClick={() => deletePlan(p.id)}>
                        Archive / Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <section className="card">
                <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>
                  {editingPlan.id ? `Editing: ${editingPlan.display_name}` : "Create New Plan"}
                </h2>
                <form className="form-grid" onSubmit={savePlan}>
                  <div className="form-row">
                    <div className="field">
                      <label>Plan Display Name</label>
                      <input value={editingPlan.display_name} onChange={(e) => setEditingPlan({ ...editingPlan, display_name: e.target.value })} required placeholder="e.g. Semester Pro Plan" />
                    </div>
                    <div className="field">
                      <label>Slug (unique)</label>
                      <input className="mono" value={editingPlan.slug} onChange={(e) => setEditingPlan({ ...editingPlan, slug: e.target.value })} required placeholder="semester-pro" />
                    </div>
                  </div>
                  <div className="form-row3">
                    <div className="field">
                      <label>Price NGN (₦)</label>
                      <input type="number" min="0" step="1" className="mono" value={editingPlan.price_ngn} onChange={(e) => setEditingPlan({ ...editingPlan, price_ngn: e.target.value })} required />
                    </div>
                    <div className="field">
                      <label>Price USD ($)</label>
                      <input type="number" min="0" step="0.01" className="mono" value={editingPlan.price_usd} onChange={(e) => setEditingPlan({ ...editingPlan, price_usd: e.target.value })} required />
                    </div>
                    <div className="field">
                      <label>Badge</label>
                      <input value={editingPlan.badge} onChange={(e) => setEditingPlan({ ...editingPlan, badge: e.target.value })} placeholder="Popular / Best Value" />
                    </div>
                  </div>
                  <div className="form-row3">
                    <div className="field">
                      <label>Duration (days)</label>
                      <input type="number" min="0" className="mono" value={editingPlan.duration_days} onChange={(e) => setEditingPlan({ ...editingPlan, duration_days: e.target.value })} placeholder="Blank = lifetime" />
                    </div>
                    <div className="field">
                      <label>Offline Lease Days</label>
                      <input type="number" min="1" max="365" className="mono" value={editingPlan.lease_days} onChange={(e) => setEditingPlan({ ...editingPlan, lease_days: e.target.value })} required />
                    </div>
                    <div className="field">
                      <label>Max PCs / Seats</label>
                      <input type="number" min="1" max="100" className="mono" value={editingPlan.max_devices} onChange={(e) => setEditingPlan({ ...editingPlan, max_devices: e.target.value })} required />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>Plan Tier</label>
                      <select value={editingPlan.plan_tier} onChange={(e) => setEditingPlan({ ...editingPlan, plan_tier: e.target.value, billing_cycle: e.target.value })}>
                        <option value="monthly">monthly</option>
                        <option value="termly">termly</option>
                        <option value="annual">annual</option>
                        <option value="lifetime">lifetime</option>
                        <option value="custom">custom</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Sort Order</label>
                      <input type="number" className="mono" value={editingPlan.sort_order} onChange={(e) => setEditingPlan({ ...editingPlan, sort_order: e.target.value })} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Feature Highlights (one per line)</label>
                    <textarea value={editingPlan.highlights} onChange={(e) => setEditingPlan({ ...editingPlan, highlights: e.target.value })} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={editingPlan.is_active} onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked })} />
                    Active &amp; visible in Desktop App Paystack Store
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="submit" className="btn btn--primary">{editingPlan.id ? "Update Plan" : "Create Plan"}</button>
                    {editingPlan.id ? (
                      <button type="button" className="btn btn--ghost" onClick={() => setEditingPlan({ ...editingPlan, id: "", display_name: "", slug: "" })}>Cancel Edit</button>
                    ) : null}
                  </div>
                </form>
              </section>
            </div>
          </>
        ) : null}

        {/* ===== TAB 5: REDEEM & DISCOUNT CODES ===== */}
        {tab === "codes" ? (
          <>
            <header className="hq-head">
              <div>
                <span className="hq-eyebrow">Growth, Vouchers &amp; Offline Sales</span>
                <h1>Redeem Codes &amp; Discount Codes</h1>
                <p>Generate single or bulk Paystack discount promo codes (% or fixed ₦/$) or full licence redeem vouchers that activate CogniTara Studio instantly without card payment.</p>
              </div>
            </header>

            <div className="hq-grid2">
              <section className="card">
                <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Create / Bulk Generate Codes</h2>
                <form className="form-grid" onSubmit={createCode}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className={`btn btn--sm ${codeForm.code_type === "discount" ? "btn--primary" : "btn--ghost"}`} onClick={() => setCodeForm({ ...codeForm, code_type: "discount", prefix: "SAVE", max_uses: "100" })}>
                      Discount / Promo Code
                    </button>
                    <button type="button" className={`btn btn--sm ${codeForm.code_type === "redeem" ? "btn--primary" : "btn--ghost"}`} onClick={() => setCodeForm({ ...codeForm, code_type: "redeem", prefix: "CT-RDM", max_uses: "1" })}>
                      Full Licence Redeem Voucher
                    </button>
                  </div>

                  <div className="form-row3">
                    <div className="field">
                      <label>Batch Count (1–50)</label>
                      <input type="number" min="1" max="50" className="mono" value={codeForm.batch_count} onChange={(e) => setCodeForm({ ...codeForm, batch_count: e.target.value })} />
                    </div>
                    {Number(codeForm.batch_count) <= 1 ? (
                      <div className="field" style={{ gridColumn: "span 2" }}>
                        <label>Custom Code (blank = auto)</label>
                        <input className="mono" value={codeForm.code} onChange={(e) => setCodeForm({ ...codeForm, code: e.target.value.toUpperCase() })} placeholder={codeForm.code_type === "redeem" ? "CT-VIP-2026" : "SCHOOL25"} />
                      </div>
                    ) : (
                      <div className="field" style={{ gridColumn: "span 2" }}>
                        <label>Batch Prefix</label>
                        <input className="mono" value={codeForm.prefix} onChange={(e) => setCodeForm({ ...codeForm, prefix: e.target.value.toUpperCase() })} />
                      </div>
                    )}
                  </div>

                  {codeForm.code_type === "discount" ? (
                    <div className="form-row">
                      <div className="field">
                        <label>Discount Kind</label>
                        <select value={codeForm.discount_kind} onChange={(e) => setCodeForm({ ...codeForm, discount_kind: e.target.value })}>
                          <option value="percent">Percentage (% off)</option>
                          <option value="fixed_ngn">Fixed Naira (₦ off)</option>
                          <option value="fixed_usd">Fixed USD ($ off)</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Value ({codeForm.discount_kind === "percent" ? "1–100%" : codeForm.discount_kind === "fixed_usd" ? "USD" : "NGN"})</label>
                        <input type="number" min="1" step="0.01" className="mono" value={codeForm.discount_value} onChange={(e) => setCodeForm({ ...codeForm, discount_value: e.target.value })} required />
                      </div>
                    </div>
                  ) : (
                    <div className="form-row">
                      <div className="field">
                        <label>Granted Plan</label>
                        <select value={codeForm.grant_plan_id} onChange={(e) => setCodeForm({ ...codeForm, grant_plan_id: e.target.value })} required>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>{p.display_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Override Days (optional)</label>
                        <input type="number" min="1" className="mono" value={codeForm.grant_duration_days} onChange={(e) => setCodeForm({ ...codeForm, grant_duration_days: e.target.value })} placeholder="Use plan default" />
                      </div>
                    </div>
                  )}

                  <div className="form-row3">
                    <div className="field">
                      <label>Max Total Uses</label>
                      <input type="number" min="1" className="mono" value={codeForm.max_uses} onChange={(e) => setCodeForm({ ...codeForm, max_uses: e.target.value })} placeholder="Unlimited" />
                    </div>
                    <div className="field">
                      <label>Per-School Limit</label>
                      <input type="number" min="1" className="mono" value={codeForm.per_school_limit} onChange={(e) => setCodeForm({ ...codeForm, per_school_limit: e.target.value })} />
                    </div>
                    <div className="field">
                      <label>Expires At (optional)</label>
                      <input type="date" value={codeForm.expires_at} onChange={(e) => setCodeForm({ ...codeForm, expires_at: e.target.value })} />
                    </div>
                  </div>

                  <div className="field">
                    <label>Internal Notes</label>
                    <input value={codeForm.notes} onChange={(e) => setCodeForm({ ...codeForm, notes: e.target.value })} placeholder="e.g. Lagos Schools Launch Promo / Offline Bank Transfer Batch" />
                  </div>

                  <button type="submit" className="btn btn--primary">
                    {Number(codeForm.batch_count) > 1 ? `Generate ${codeForm.batch_count} Codes` : "Create Code"}
                  </button>
                </form>

                {lastBatchCodes.length > 0 ? (
                  <div className="hq-power-box" style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>Newly Generated Codes ({lastBatchCodes.length})</strong>
                      <button type="button" className="btn btn--ghost btn--xs" onClick={() => { navigator.clipboard?.writeText(lastBatchCodes.join("\n")); showToast("Copied all codes!"); }}>Copy All</button>
                    </div>
                    <pre className="mono" style={{ margin: 0, fontSize: 12, maxHeight: 140, overflowY: "auto" }}>{lastBatchCodes.join("\n")}</pre>
                  </div>
                ) : null}
              </section>

              <section className="card">
                <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>All Active &amp; Historical Codes ({codes.length})</h2>
                <div className="hq-table-wrap">
                  <table className="hq-table">
                    <thead><tr><th>Code</th><th>Type / Value</th><th>Uses</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {codes.length === 0 ? (
                        <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--ink-3)" }}>No codes created yet.</td></tr>
                      ) : codes.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <code className="mono" style={{ fontWeight: 700 }}>{c.code}</code>
                            {c.notes ? <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.notes}</div> : null}
                          </td>
                          <td>
                            <span className={`pill ${c.code_type === "redeem" ? "pill--accent" : "pill--ok"}`}>{c.code_type.toUpperCase()}</span>
                            <div style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                              {c.code_type === "redeem"
                                ? `${c.grant_plan_name || "Plan"}${c.grant_duration_days ? ` (${c.grant_duration_days}d)` : ""}`
                                : c.discount_kind === "percent" ? `${c.discount_value}% off` : `${c.discount_kind === "fixed_usd" ? "$" : "₦"}${c.discount_value} off`}
                            </div>
                          </td>
                          <td className="mono">{c.uses_count} / {c.max_uses ?? "∞"}</td>
                          <td><span className={`pill ${c.is_active ? "pill--ok" : "pill--warn"}`}>{c.is_active ? "ACTIVE" : "PAUSED"}</span></td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <button type="button" className="btn btn--ghost btn--xs" onClick={() => { navigator.clipboard?.writeText(c.code); showToast(`Copied ${c.code}`); }}>Copy</button>{" "}
                            <button type="button" className="btn btn--ghost btn--xs" onClick={() => toggleCode(c.id)}>{c.is_active ? "Pause" : "Enable"}</button>{" "}
                            <button type="button" className="btn btn--danger btn--xs" onClick={() => deleteCode(c.id)}>Del</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        ) : null}

        {/* ===== TAB 6: PAYSTACK, BREVO OTP & GLOBAL KILL-SWITCHES ===== */}
        {tab === "settings" ? (
          <>
            <header className="hq-head">
              <div>
                <span className="hq-eyebrow">Gateway, Brevo OTP &amp; Fleet Controls</span>
                <h1>Paystack Keys, Brevo OTP &amp; Kill-Switches</h1>
                <p>Secret keys are encrypted at rest with AES-256-GCM in Neon Postgres and never exposed to desktop clients or browsers.</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={testPaystackConnection}>
                  Test Paystack
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => testBrevoConnection(false)}>
                  Test Brevo Key
                </button>
              </div>
            </header>

            <form className="hq-grid-equal" onSubmit={savePlatformSettings}>
              <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
                <section className="card">
                  <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Paystack Payment Gateway</h2>
                  <div className="form-grid">
                    <div className="form-row">
                      <div className="field">
                        <label>Paystack Mode</label>
                        <select value={settingsForm.paystack_mode} onChange={(e) => setSettingsForm({ ...settingsForm, paystack_mode: e.target.value })}>
                          <option value="test">Test Mode (Sandbox)</option>
                          <option value="live">Live Mode (Production)</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Default Currency</label>
                        <select value={settingsForm.default_currency} onChange={(e) => setSettingsForm({ ...settingsForm, default_currency: e.target.value })}>
                          <option value="NGN">NGN (Nigerian Naira ₦)</option>
                          <option value="USD">USD (US Dollar $)</option>
                          <option value="GHS">GHS (Ghana Cedi)</option>
                          <option value="KES">KES (Kenyan Shilling)</option>
                          <option value="ZAR">ZAR (South African Rand)</option>
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label>Paystack Public Key</label>
                      <input className="mono" value={settingsForm.paystack_public_key} onChange={(e) => setSettingsForm({ ...settingsForm, paystack_public_key: e.target.value })} placeholder="pk_live_... or pk_test_..." />
                    </div>
                    <div className="field">
                      <label>
                        Paystack Secret Key{" "}
                        <span className="mono" style={{ color: settingsForm.paystack_secret_configured ? "var(--ok)" : "var(--warn)" }}>
                          ({settingsForm.paystack_secret_configured ? `Encrypted: ${settingsForm.paystack_secret_masked}` : "Not set"})
                        </span>
                      </label>
                      <input type="password" className="mono" value={settingsForm.paystack_secret_key} onChange={(e) => setSettingsForm({ ...settingsForm, paystack_secret_key: e.target.value })} placeholder="Leave blank to keep existing encrypted secret key" />
                    </div>
                    <div className="field">
                      <label>Paystack Webhook URL (paste in Paystack Dashboard → API Keys &amp; Webhooks)</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input className="mono" readOnly value={settingsForm.webhook_url || ""} style={{ flex: 1 }} />
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { navigator.clipboard?.writeText(settingsForm.webhook_url || ""); showToast("Webhook URL copied!"); }}>Copy</button>
                      </div>
                    </div>
                    <div className="field">
                      <label>Ed25519 Licence Signing Authority Public Key (Embedded in Desktop App)</label>
                      <input className="mono" readOnly value={settingsForm.ed25519_public_key || ""} />
                    </div>
                  </div>
                </section>

                <section className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>Brevo Transactional Email &amp; 6-Digit OTP</h2>
                    <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noreferrer" className="btn btn--ghost btn--xs">
                      Get Brevo API Key →
                    </a>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>
                        Brevo v3 API Key{" "}
                        <span className="mono" style={{ color: settingsForm.brevo_configured ? "var(--ok)" : "var(--warn)" }}>
                          ({settingsForm.brevo_configured ? `Encrypted: ${settingsForm.brevo_api_key_masked}` : "Not set"})
                        </span>
                      </label>
                      <input
                        type="password"
                        className="mono"
                        value={settingsForm.brevo_api_key}
                        onChange={(e) => setSettingsForm({ ...settingsForm, brevo_api_key: e.target.value })}
                        placeholder="xkeysib-... (leave blank to keep existing encrypted key)"
                      />
                    </div>
                    <div className="form-row">
                      <div className="field">
                        <label>Verified Sender Email</label>
                        <input
                          type="email"
                          className="mono"
                          value={settingsForm.brevo_sender_email}
                          onChange={(e) => setSettingsForm({ ...settingsForm, brevo_sender_email: e.target.value })}
                          placeholder="noreply@yourdomain.com"
                        />
                      </div>
                      <div className="field">
                        <label>Sender Display Name</label>
                        <input
                          value={settingsForm.brevo_sender_name}
                          onChange={(e) => setSettingsForm({ ...settingsForm, brevo_sender_name: e.target.value })}
                          placeholder="CogniTara Cloud"
                        />
                      </div>
                    </div>
                    <div className="hq-switch-row">
                      <div>
                        <strong>Require 6-Digit Brevo Email OTP on Auth</strong>
                        <span>Enforces email OTP verification for school sign-up &amp; sign-in across Web and Desktop Studio</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(settingsForm.require_email_otp)}
                        onChange={(e) => setSettingsForm({ ...settingsForm, require_email_otp: e.target.checked })}
                      />
                    </div>
                    <div className="field">
                      <label>Send Live Test OTP Email (after saving key)</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          type="email"
                          value={brevoTestEmail}
                          onChange={(e) => setBrevoTestEmail(e.target.value)}
                          placeholder="you@example.com"
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="btn btn--ghost btn--sm" onClick={() => testBrevoConnection(true)}>
                          Send Test OTP
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              <section className="card" style={{ alignSelf: "start" }}>
                <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Global Broadcast &amp; Platform Kill-Switches</h2>
                <div className="form-grid">
                  <div className="field">
                    <label>Global Desktop App Broadcast Banner</label>
                    <textarea value={settingsForm.global_announcement} onChange={(e) => setSettingsForm({ ...settingsForm, global_announcement: e.target.value })} placeholder="Shown inside every CogniTara Studio desktop app on next sync (leave blank to hide)" />
                  </div>
                  <div className="form-row">
                    <div className="field">
                      <label>Broadcast Severity</label>
                      <select value={settingsForm.global_announcement_level} onChange={(e) => setSettingsForm({ ...settingsForm, global_announcement_level: e.target.value })}>
                        <option value="info">Info (Blue)</option>
                        <option value="promo">Promo (Green)</option>
                        <option value="warning">Warning (Amber)</option>
                        <option value="critical">Critical (Red)</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Minimum Desktop App Version</label>
                      <input className="mono" value={settingsForm.min_desktop_version} onChange={(e) => setSettingsForm({ ...settingsForm, min_desktop_version: e.target.value })} placeholder="2.2.1" />
                    </div>
                  </div>

                  <div>
                    <div className="hq-switch-row">
                      <div><strong>Allow Paystack Checkout</strong><span>Toggle desktop &amp; web Paystack purchasing live</span></div>
                      <input type="checkbox" checked={settingsForm.allow_paystack_checkout} onChange={(e) => setSettingsForm({ ...settingsForm, allow_paystack_checkout: e.target.checked })} />
                    </div>
                    <div className="hq-switch-row">
                      <div><strong>Allow New School Sign-Ups</strong><span>Pause new self-registrations instantly if needed</span></div>
                      <input type="checkbox" checked={settingsForm.allow_self_signup} onChange={(e) => setSettingsForm({ ...settingsForm, allow_self_signup: e.target.checked })} />
                    </div>
                    <div className="hq-switch-row">
                      <div><strong>Allow 14-Day Trial Activation</strong><span>Controls free evaluation trial availability</span></div>
                      <input type="checkbox" checked={settingsForm.allow_trial_activation} onChange={(e) => setSettingsForm({ ...settingsForm, allow_trial_activation: e.target.checked })} />
                    </div>
                    <div className="hq-switch-row">
                      <div><strong style={{ color: "var(--warn)" }}>Global Maintenance Mode</strong><span>Broadcasts maintenance alert across all desktop apps</span></div>
                      <input type="checkbox" checked={settingsForm.maintenance_mode} onChange={(e) => setSettingsForm({ ...settingsForm, maintenance_mode: e.target.checked })} />
                    </div>
                  </div>

                  {settingsForm.maintenance_mode ? (
                    <div className="field">
                      <label>Maintenance Banner Message</label>
                      <input value={settingsForm.maintenance_message} onChange={(e) => setSettingsForm({ ...settingsForm, maintenance_message: e.target.value })} placeholder="Scheduled cloud upgrade in progress..." />
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="submit" className="btn btn--primary">Save Settings &amp; Push Live</button>
                    <button type="button" className="btn btn--ghost" onClick={testPaystackConnection}>Verify Paystack Key</button>
                  </div>
                </div>
              </section>
            </form>
          </>
        ) : null}

        {/* ===== TAB 7: SECURITY AUDIT LOG ===== */}
        {tab === "audit" ? (
          <>
            <header className="hq-head">
              <div>
                <span className="hq-eyebrow">Immutable Forensics</span>
                <h1>Security &amp; Developer Audit Log</h1>
                <p>Every Paystack key change, licence grant/revocation, ban, password reset, webhook verification, and HQ login attempt.</p>
              </div>
            </header>
            <div className="hq-table-wrap">
              <table className="hq-table">
                <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th><th>Details</th></tr></thead>
                <tbody>
                  {auditLogs.map((a) => (
                    <tr key={a.id}>
                      <td className="mono" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{fmtDate(a.created_at)}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{a.actor_email || "system"}</td>
                      <td><code className="mono" style={{ fontWeight: 700 }}>{a.action}</code></td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{a.target_type ? `${a.target_type}:${String(a.target_id || "").slice(0, 8)}` : "—"}</td>
                      <td className="mono" style={{ fontSize: 11.5 }}>{a.ip_address || "—"}</td>
                      <td className="mono" style={{ fontSize: 11, color: "var(--ink-3)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {JSON.stringify(a.details_json || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </main>

      {/* ===== SCHOOL POWER CONTROLS SLIDE-OVER DRAWER ===== */}
      {selectedSchool ? (
        <div className="hq-drawer-bg" onClick={(e) => { if (e.target === e.currentTarget) setSelectedSchool(null); }}>
          <div className="hq-drawer">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <span className="hq-eyebrow">Live Remote School Control</span>
                <h2 style={{ margin: 0, fontSize: 20 }}>{selectedSchool.school_name}</h2>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                  {selectedSchool.full_name} · <span className="mono">{selectedSchool.email}</span>
                </div>
              </div>
              <button type="button" className="btn btn--ghost btn--xs" onClick={() => setSelectedSchool(null)}>Close ✕</button>
            </div>

            <div className="field">
              <label>Audit Reason (recorded in immutable HQ log)</label>
              <input value={pwReason} onChange={(e) => setPwReason(e.target.value)} placeholder="e.g. Verified bank transfer / Hardware upgrade / ToS violation" />
            </div>

            {/* 1. Grant / Issue Licence */}
            <div className="hq-power-box">
              <h3>1. Issue Instant Ed25519 Licence</h3>
              <div className="form-row">
                <select className="hq-search" style={{ maxWidth: "none" }} value={pwPlanId} onChange={(e) => setPwPlanId(e.target.value)}>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                </select>
                <input className="hq-search mono" style={{ maxWidth: "none" }} type="number" min="1" value={pwCustomDays} onChange={(e) => setPwCustomDays(e.target.value)} placeholder="Custom days (optional)" />
              </div>
              <button type="button" className="btn btn--primary btn--sm" disabled={busyAction} onClick={() => runSchoolPowerAction("grant_license", { plan_id: pwPlanId, duration_days: pwCustomDays || undefined })}>
                Issue &amp; Sign Licence Now
              </button>
            </div>

            {/* 2. Extend / Revoke / Reset HWID */}
            <div className="hq-power-box">
              <h3>2. Active Licence &amp; Machine Control</h3>
              <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
                Current Key: <code className="mono">{selectedSchool.license_key || "None"}</code> · Active PCs: <strong className="mono">{selectedSchool.active_hwids || 0}</strong>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="hq-search mono" style={{ maxWidth: 110 }} type="number" min="1" value={pwExtendDays} onChange={(e) => setPwExtendDays(e.target.value)} />
                <button type="button" className="btn btn--ok btn--sm" disabled={busyAction} onClick={() => runSchoolPowerAction("extend_license", { days: Number(pwExtendDays) })}>
                  + Extend Bonus Days
                </button>
              </div>
              <div className="hq-btn-row">
                <button type="button" className="btn btn--ghost btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("reset_hwid")}>Reset Machine HWID Slots</button>
                <button type="button" className="btn btn--danger btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("revoke_license")}>⚡ Revoke Licence (Burn Tombstone)</button>
              </div>
            </div>

            {/* 3. Push Live Targeted Desktop Notice */}
            <div className="hq-power-box">
              <h3>3. Push Direct Notice to School&apos;s Desktop App</h3>
              <textarea
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink)", font: "inherit", fontSize: 13 }}
                rows={2}
                value={pwNotice}
                onChange={(e) => setPwNotice(e.target.value)}
                placeholder="Type a message that pops up inside this school's CogniTara Studio…"
              />
              <div className="hq-btn-row">
                <select className="hq-search" style={{ maxWidth: 140, height: 32 }} value={pwNoticeLevel} onChange={(e) => setPwNoticeLevel(e.target.value)}>
                  <option value="info">Info</option>
                  <option value="promo">Promo</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
                <button type="button" className="btn btn--primary btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("send_notice", { notice: pwNotice, level: pwNoticeLevel })}>Push Notice</button>
                <button type="button" className="btn btn--ghost btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("clear_notice")}>Clear</button>
              </div>
            </div>

            {/* 4. Per-School Remote Feature Overrides */}
            <div className="hq-power-box">
              <h3>4. Remote Feature Flag Overrides (JSON)</h3>
              <textarea
                className="mono"
                style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-2)", background: "var(--surface)", color: "var(--ink)", fontSize: 12 }}
                rows={3}
                value={pwOverridesText}
                onChange={(e) => setPwOverridesText(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--ghost btn--xs"
                disabled={busyAction}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(pwOverridesText || "{}");
                    void runSchoolPowerAction("set_feature_overrides", { overrides: parsed });
                  } catch {
                    showToast("Invalid JSON in feature overrides.");
                  }
                }}
              >
                Save Feature Overrides
              </button>
            </div>

            {/* 5. Account Security & Kill-Switches */}
            <div className="hq-power-box">
              <h3>5. Security, Sessions &amp; Account Kill-Switches</h3>
              {pwTempPass ? (
                <div className="alert alert--ok" style={{ marginBottom: 0 }}>
                  New Temporary Password: <code className="mono" style={{ fontWeight: 700 }}>{pwTempPass}</code>
                </div>
              ) : null}
              <div className="hq-btn-row">
                <button type="button" className="btn btn--warn btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("force_signout")}>Force Sign-Out All Devices</button>
                <button type="button" className="btn btn--ghost btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("reset_password")}>Generate Temp Password</button>
                {selectedSchool.school_status === "active" ? (
                  <>
                    <button type="button" className="btn btn--warn btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("suspend_school")}>Suspend School</button>
                    <button type="button" className="btn btn--danger btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("ban_school")}>Ban + Kill Licences</button>
                  </>
                ) : (
                  <button type="button" className="btn btn--ok btn--xs" disabled={busyAction} onClick={() => runSchoolPowerAction("unban_school")}>Restore / Unban School</button>
                )}
                <button
                  type="button"
                  className="btn btn--danger btn--xs"
                  disabled={busyAction}
                  onClick={() => {
                    if (window.confirm(`Permanently delete ${selectedSchool.school_name} (${selectedSchool.email})?`)) {
                      void runSchoolPowerAction("delete_school");
                    }
                  }}
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toastMsg ? <div className="hq-toast">{toastMsg}</div> : null}
    </div>
  );
}
