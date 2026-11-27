"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CogniTaraLockup, ResurfMenuIcon } from "@/components/CogniTaraLogo";
import {
  IconBan,
  IconCloud,
  IconCreditCard,
  IconDownload,
  IconFileText,
  IconGift,
  IconLayout,
  IconList,
  IconMail,
  IconMegaphone,
  IconMoon,
  IconSearch,
  IconSettings,
  IconShield,
  IconStar,
  IconSun,
  IconTag,
  IconUsers,
} from "@/components/Icons";
import { HqCmsTab } from "@/components/hq/HqCmsTab";
import { HqLoginGate } from "@/components/hq/HqLoginGate";
import { HqPaymentRow, HqPaymentsKpis, HqPaymentsTab } from "@/components/hq/HqPaymentsTab";
import { HqPaymentSettingsTab, HqSettingsData } from "@/components/hq/HqPaymentSettingsTab";
import { HqCodeRow, HqCodesTab, HqPlanRow, HqPlansTab, HqRedemptionRow, HqSchoolRow, HqSchoolsTab } from "@/components/hq/HqSchoolsAndPlansTabs";
import {
  HqBackupsTab,
  HqBroadcastsTab,
  HqDownloadLeadsTab,
  HqEmailsTab,
  HqReferralsTab,
  HqReviewsTab,
  HqStaffSecurityTab,
} from "@/components/hq/HqSystemTabs";

type TabId =
  | "dashboard"
  | "cms"
  | "schools"
  | "download_leads"
  | "reviews"
  | "referrals"
  | "bans"
  | "plans"
  | "payments"
  | "payment_settings"
  | "codes"
  | "backups"
  | "broadcasts"
  | "emails"
  | "security"
  | "audit";

interface NavItem {
  id: TabId;
  group: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", group: "Overview", label: "Dashboard", icon: <IconLayout size={15} /> },
  { id: "cms", group: "Website", label: "Website CMS", icon: <IconFileText size={15} /> },
  { id: "reviews", group: "Website", label: "Reviews & ratings", icon: <IconStar size={15} /> },
  { id: "broadcasts", group: "Website", label: "Banners, trials & flags", icon: <IconMegaphone size={15} /> },
  { id: "schools", group: "Schools", label: "Schools & accounts", icon: <IconUsers size={15} /> },
  { id: "download_leads", group: "Schools", label: "Download leads", icon: <IconDownload size={15} /> },
  { id: "referrals", group: "Schools", label: "Referrals & payouts", icon: <IconGift size={15} /> },
  { id: "bans", group: "Schools", label: "Fraud & bans", icon: <IconBan size={15} /> },
  { id: "plans", group: "Money", label: "Plans & prices", icon: <IconTag size={15} /> },
  { id: "payments", group: "Money", label: "Payments", icon: <IconCreditCard size={15} /> },
  { id: "payment_settings", group: "Money", label: "Payment settings", icon: <IconSettings size={15} /> },
  { id: "codes", group: "Money", label: "Redeem & promo codes", icon: <IconGift size={15} /> },
  { id: "backups", group: "App control", label: "Cloud exam backups", icon: <IconCloud size={15} /> },
  { id: "emails", group: "System", label: "Emails & OTP", icon: <IconMail size={15} /> },
  { id: "security", group: "System", label: "Staff & 2FA security", icon: <IconShield size={15} /> },
  { id: "audit", group: "System", label: "Audit log", icon: <IconList size={15} /> },
];

const NAV_GROUPS = ["Overview", "Website", "Schools", "Money", "App control", "System"];

function fmtNgn(kobo: number) {
  return `₦${(Number(kobo || 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function DeveloperHqPage() {
  const [authState, setAuthState] = useState<"checking" | "login" | "ready">("checking");
  const [tab, setTab] = useState<TabId>("dashboard");
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [sideOpen, setSideOpen] = useState(false);

  // Ctrl+K Command Palette
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");

  // Loaded data
  const [overview, setOverview] = useState<any>(null);
  const [schools, setSchools] = useState<HqSchoolRow[]>([]);
  const [purchases, setPurchases] = useState<HqPaymentRow[]>([]);
  const [paymentKpis, setPaymentKpis] = useState<HqPaymentsKpis>({
    paid_today_ngn_minor: 0,
    paid_month_ngn_minor: 0,
    waiting_24h_count: 0,
    refunded_month_ngn_minor: 0,
    test_payments_count: 0,
  });
  const [plans, setPlans] = useState<HqPlanRow[]>([]);
  const [codes, setCodes] = useState<HqCodeRow[]>([]);
  const [redemptions, setRedemptions] = useState<HqRedemptionRow[]>([]);
  const [settings, setSettings] = useState<HqSettingsData | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [toast, setToast] = useState<string>("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? "" : cur)), 4200);
  }

  useEffect(() => {
    const cur = document.documentElement.getAttribute("data-theme");
    setTheme(cur === "dark" ? "dark" : "light");
  }, []);

  // Ctrl+K / Cmd+K global jump palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
        setCmdQuery("");
      } else if (e.key === "Escape" && cmdOpen) {
        setCmdOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cmdOpen]);

  async function loadAllData() {
    const sessRes = await fetch("/api/v1/hq/session", { credentials: "include" }).catch(() => null);
    const sessJson = sessRes ? await sessRes.json().catch(() => null) : null;
    if (!sessJson?.authenticated) {
      setAuthState("login");
      return;
    }

    const ovRes = await fetch("/api/v1/hq/overview", { credentials: "include" });
    if (ovRes.status === 401 || ovRes.status === 403) {
      setAuthState("login");
      return;
    }
    const ovJson = await ovRes.json().catch(() => null);
    if (!ovJson?.ok) {
      setAuthState("login");
      return;
    }
    setOverview(ovJson);
    setAuthState("ready");

    const [uRes, pRes, plRes, cRes, sRes, aRes] = await Promise.all([
      fetch("/api/v1/hq/users", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/purchases", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/plans", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/codes", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/settings", { credentials: "include" }).then((r) => r.json()).catch(() => null),
      fetch("/api/v1/hq/audit", { credentials: "include" }).then((r) => r.json()).catch(() => null),
    ]);
    if (uRes?.ok) setSchools(uRes.users || []);
    if (pRes?.ok) {
      setPurchases(pRes.purchases || []);
      if (pRes.kpis) setPaymentKpis(pRes.kpis);
    }
    if (plRes?.ok) setPlans(plRes.plans || []);
    if (cRes?.ok) {
      setCodes(cRes.codes || []);
      setRedemptions(cRes.redemptions || []);
    }
    if (sRes?.ok) setSettings(sRes.settings);
    if (aRes?.ok) setAuditLogs(aRes.logs || []);
  }

  useEffect(() => {
    void loadAllData();
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ct-cloud-theme", next);
    } catch {}
  }

  async function saveSettings(patch: Record<string, unknown>) {
    const res = await fetch("/api/v1/hq/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => r.json());
    showToast(res?.message || (res?.ok ? "Settings saved." : "Save failed."));
    if (res?.ok && res.settings) setSettings(res.settings);
    await loadAllData();
  }

  async function testProvider(provider: "paystack" | "brevo", extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/v1/hq/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, ...extra }),
    }).then((r) => r.json());
    showToast(res?.message || (res?.ok ? "Connected!" : "Test failed."));
  }

  async function handleSignOut() {
    await fetch("/api/v1/auth/signout", { method: "POST", credentials: "include" });
    setAuthState("login");
  }

  const cmdMatches = useMemo(() => {
    const q = cmdQuery.trim().toLowerCase();
    if (!q) return NAV_ITEMS;
    return NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
  }, [cmdQuery]);

  if (authState === "checking") {
    return (
      <div className="ct-shell" style={{ textAlign: "center", paddingTop: 120 }}>
        <p style={{ color: "var(--ink-2)" }}>Checking administrator session…</p>
      </div>
    );
  }

  if (authState === "login") {
    return <HqLoginGate onAuthenticated={() => void loadAllData()} />;
  }

  const m = overview?.metrics || {};
  const badgeCounts: Partial<Record<TabId, number>> = {
    schools: m.schools_total || 0,
    download_leads: m.download_leads_total || 0,
    reviews: m.reviews_pending || 0,
    bans: (m.schools_banned || 0) + (m.schools_suspended || 0),
    payments: (m.paid_orders || 0) + (m.pending_orders || 0),
    codes: m.promo_codes_active || 0,
  };

  return (
    <div className="hq-layout">
      {/* Grouped Left Sidebar (SolutionTee-grade CMS architecture) */}
      <aside className={`hq-side ${sideOpen ? "is-open" : ""}`}>
        <div className="hq-side__brand">
          <Link href="/" className="ct-brand" style={{ display: "grid", gap: 3 }}>
            <CogniTaraLockup markSize={20} wordmarkHeight={13} />
            <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600, paddingLeft: 29 }}>Admin CMS</span>
          </Link>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
          </button>
        </div>

        <button
          type="button"
          className="hq-jump-btn"
          onClick={() => {
            setCmdOpen(true);
            setCmdQuery("");
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <IconSearch size={14} />
            <span>Search or jump to…</span>
          </span>
          <span className="hq-kbd">Ctrl K</span>
        </button>

        {NAV_GROUPS.map((group) => (
          <div key={group} className="hq-side__group">
            <div className="hq-side__label">{group}</div>
            {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
              const cnt = badgeCounts[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`hq-nav-btn ${tab === item.id ? "is-active" : ""}`}
                  onClick={() => {
                    setTab(item.id);
                    setSideOpen(false);
                  }}
                >
                  <span className="hq-nav-btn__left">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {cnt ? <span className="hq-nav-btn__cnt">{cnt}</span> : null}
                </button>
              );
            })}
          </div>
        ))}

        <div className="hq-side__foot">
          <div style={{ padding: "0 8px 4px", fontSize: 12, color: "var(--ink-3)" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{overview?.hq_user?.full_name || "Admin"}</div>
            <div className="mono" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis" }}>
              {overview?.hq_user?.email}
            </div>
          </div>
          <Link href="/dashboard" className="btn btn--ghost btn--sm" style={{ width: "100%" }}>
            School view
          </Link>
          <button type="button" className="btn btn--outline btn--sm" style={{ width: "100%" }} onClick={() => void handleSignOut()}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area (centered on ultrawide monitors) */}
      <div className="hq-content-wrap">
        <div className="hq-topbar-mobile">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSideOpen((v) => !v)}>
            <ResurfMenuIcon size={16} />
            <span>Menu</span>
          </button>
          <CogniTaraLockup markSize={18} wordmarkHeight={12} suffix="HQ" />
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => setCmdOpen(true)}>
            Jump
          </button>
        </div>

        <main className="hq-main">
          {tab === "dashboard" ? (
            <div style={{ display: "grid", gap: 20 }}>
              <div className="hq-head" style={{ marginBottom: 0 }}>
                <div>
                  <h1>Dashboard</h1>
                  <p>Live platform revenue (excluding test orders), active school servers, licences, and cloud backup status.</p>
                </div>
                <div className="hq-btn-row">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTab("payment_settings")}>
                    Paystack: {settings?.paystack_mode === "live" ? "Live" : "Test"}
                  </button>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => void loadAllData()}>
                    Refresh
                  </button>
                </div>
              </div>

              <div className="hq-kpi-strip">
                <div className="hq-kpi">
                  <span className="hq-kpi__lbl">Live revenue (NGN)</span>
                  <span className="hq-kpi__val" style={{ color: "var(--ok)" }}>{fmtNgn(m.revenue_ngn_kobo || 0)}</span>
                  <span className="hq-kpi__sub">{m.paid_orders || 0} live orders · {m.test_orders || 0} test</span>
                </div>
                <div className="hq-kpi">
                  <span className="hq-kpi__lbl">Registered schools</span>
                  <span className="hq-kpi__val">{m.schools_total || 0}</span>
                  <span className="hq-kpi__sub">{m.schools_seen_24h || 0} seen in last 24 h</span>
                </div>
                <div className="hq-kpi">
                  <span className="hq-kpi__lbl">Active licences</span>
                  <span className="hq-kpi__val">{m.licenses_active || 0}</span>
                  <span className="hq-kpi__sub">{m.active_devices_24h || 0} desktop PCs online today</span>
                </div>
                <div className="hq-kpi">
                  <span className="hq-kpi__lbl">Cloud exam backups</span>
                  <span className="hq-kpi__val">{m.backups_total || 0}</span>
                  <span className="hq-kpi__sub">Reminder every {overview?.platform?.backup_reminder_days || 7} days</span>
                </div>
              </div>

              <div className="hq-grid2">
                <section className="card">
                  <div className="hq-toolbar" style={{ marginBottom: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 15.5 }}>Recent payments</h2>
                    <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTab("payments")}>
                      View all
                    </button>
                  </div>
                  <div className="hq-table-wrap">
                    <table className="hq-table">
                      <thead>
                        <tr><th>School</th><th>Plan</th><th>Amount</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {(overview?.recent_purchases || []).length === 0 ? (
                          <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--ink-3)" }}>No payments yet.</td></tr>
                        ) : (
                          overview.recent_purchases.slice(0, 8).map((p: any) => (
                            <tr key={p.id} className="is-clickable" onClick={() => setTab("payments")}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{p.school_name}</div>
                                <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{p.paystack_reference}</div>
                              </td>
                              <td>{p.plan_name}</td>
                              <td className="mono">
                                {fmtNgn(p.customer_paid_minor || p.amount_minor)}
                                {p.is_test ? <span className="tag-test">Test</span> : null}
                              </td>
                              <td>
                                <span className={`status-txt ${p.status === "success" ? "status-txt--ok" : p.status === "failed" || p.status === "refunded" ? "status-txt--bad" : "status-txt--warn"}`}>
                                  {p.status === "success" ? "Paid" : p.status === "initialized" ? "Not finished" : p.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="card">
                  <div className="hq-toolbar" style={{ marginBottom: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 15.5 }}>Recent admin activity</h2>
                    <button type="button" className="btn btn--ghost btn--xs" onClick={() => setTab("audit")}>
                      Full log
                    </button>
                  </div>
                  <dl className="dl">
                    {(overview?.recent_audit || []).slice(0, 7).map((a: any) => (
                      <div key={a.id}>
                        <dt>
                          <div style={{ color: "var(--ink)", fontWeight: 600, fontSize: 12.5 }}>{a.action}</div>
                          <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.actor_email || "system"}</div>
                        </dt>
                        <dd className="tnum" style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500 }}>
                          {new Date(a.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </div>
            </div>
          ) : null}

          {tab === "cms" ? <HqCmsTab onToast={showToast} /> : null}

          {tab === "schools" ? (
            <HqSchoolsTab schools={schools} plans={plans} mode="all" onRefresh={loadAllData} onToast={showToast} />
          ) : null}

          {tab === "download_leads" ? (
            <HqDownloadLeadsTab onToast={showToast} onRefreshOverview={loadAllData} />
          ) : null}

          {tab === "reviews" ? (
            <HqReviewsTab onToast={showToast} onRefreshOverview={loadAllData} />
          ) : null}

          {tab === "bans" ? (
            <HqSchoolsTab schools={schools} plans={plans} mode="bans" onRefresh={loadAllData} onToast={showToast} />
          ) : null}

          {tab === "referrals" ? <HqReferralsTab onToast={showToast} /> : null}

          {tab === "plans" ? (
            <HqPlansTab plans={plans} onRefresh={loadAllData} onToast={showToast} />
          ) : null}

          {tab === "payments" ? (
            <HqPaymentsTab purchases={purchases} kpis={paymentKpis} onRefresh={loadAllData} onToast={showToast} />
          ) : null}

          {tab === "payment_settings" && settings ? (
            <HqPaymentSettingsTab
              settings={settings}
              onSaveSettings={saveSettings}
              onTestProvider={testProvider}
              onToast={showToast}
            />
          ) : null}

          {tab === "codes" ? (
            <HqCodesTab codes={codes} redemptions={redemptions} plans={plans} onRefresh={loadAllData} onToast={showToast} />
          ) : null}

          {tab === "backups" ? <HqBackupsTab onToast={showToast} /> : null}

          {tab === "broadcasts" && settings ? (
            <HqBroadcastsTab settings={settings} onSaveSettings={saveSettings} />
          ) : null}

          {tab === "emails" && settings ? (
            <HqEmailsTab settings={settings} onSaveSettings={saveSettings} onTestProvider={testProvider} />
          ) : null}

          {tab === "security" && settings ? (
            <HqStaffSecurityTab settings={settings} onSaveSettings={saveSettings} onToast={showToast} />
          ) : null}

          {tab === "audit" ? (
            <div>
              <div className="hq-head">
                <div>
                  <h1>Audit log</h1>
                  <p>Immutable record of HQ logins, failed security checks, licence grants, refunds, and settings updates.</p>
                </div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void loadAllData()}>Refresh</button>
              </div>
              <div className="hq-table-wrap">
                <table className="hq-table">
                  <thead>
                    <tr><th>Time</th><th>Actor</th><th>Action</th><th>IP</th><th>Details</th></tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((row) => (
                      <tr key={row.id}>
                        <td className="tnum" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          {new Date(row.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>{row.actor_email || "system"}</td>
                        <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{row.action}</td>
                        <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{row.ip_address || "—"}</td>
                        <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {JSON.stringify(row.details_json || {})}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* Mobile Sidebar Backdrop */}
      {sideOpen ? (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 65, background: "rgba(0,0,0,0.45)" }}
          onClick={() => setSideOpen(false)}
        />
      ) : null}

      {/* Ctrl+K Global Search & Jump Command Palette */}
      {cmdOpen ? (
        <div className="modal-bg" onClick={() => setCmdOpen(false)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              className="cmd-input"
              value={cmdQuery}
              onChange={(e) => setCmdQuery(e.target.value)}
              placeholder="Jump to a page or setting…"
            />
            <div className="cmd-list">
              {cmdMatches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="cmd-item"
                  onClick={() => {
                    setTab(item.id);
                    setCmdOpen(false);
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  <small>{item.group}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className="hq-toast" role="status">{toast}</div> : null}
    </div>
  );
}
