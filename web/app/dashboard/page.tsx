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
  licenses: Array<{ id: string; license_key: string; plan_tier: string; status: string; expires_at: string | null }>;
}

const RELEASES_URL = "https://github.com/Emmaco08/cognitarapp/releases/latest";

export default function DashboardPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/v1/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.ok) {
          router.replace("/signin");
          return;
        }
        setAccount(data);
        setLoading(false);
      })
      .catch(() => router.replace("/signin"));
  }, [router]);

  async function handleSignOut() {
    await fetch("/api/v1/auth/signout", { method: "POST", credentials: "include" });
    router.push("/signin");
  }

  function copyRef() {
    if (!account?.referral_code) return;
    navigator.clipboard?.writeText(account.referral_code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="ct-shell">
      <BrandHeader signedIn={Boolean(account)} />
      {loading || !account ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <p style={{ color: "var(--ink-2)" }}>Loading your CogniTara Cloud account…</p>
        </div>
      ) : (
        <main>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
            <div>
              <span className="pill pill--ok" style={{ marginBottom: 10 }}>Cloud Account Active</span>
              <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.025em" }}>
                {account.school?.school_name || account.user.full_name}
              </h1>
              <p style={{ margin: "4px 0 0", color: "var(--ink-2)" }}>
                Signed in as {account.user.full_name} ({account.user.email})
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn--primary">
                Download CogniTara Studio
              </a>
              <button type="button" className="btn btn--ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>

          <div className="dash-grid">
            <section className="card">
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>School Profile & Sync</h2>
              <dl className="dl">
                <div>
                  <dt>School Name</dt>
                  <dd>{account.school?.school_name || "—"}</dd>
                </div>
                <div>
                  <dt>Account Email</dt>
                  <dd className="mono">{account.user.email}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{account.user.role}</dd>
                </div>
                <div>
                  <dt>Account Status</dt>
                  <dd><span className="pill pill--ok">{account.user.status}</span></dd>
                </div>
                <div>
                  <dt>Referral Code</dt>
                  <dd style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code className="mono">{account.referral_code || "—"}</code>
                    {account.referral_code ? (
                      <button type="button" className="btn btn--ghost btn--sm" onClick={copyRef}>
                        {copied ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="card">
              <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>CogniTara Studio Licences</h2>
              {account.licenses.length === 0 ? (
                <div>
                  <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
                    No paid licence key linked yet. Sign in inside <strong>CogniTara Studio</strong> on your
                    Windows exam server to sync this account and start your 14-day hardware-bound trial immediately.
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                    <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="btn btn--primary btn--sm">
                      Get Windows Installer
                    </a>
                    <Link href="/" className="btn btn--ghost btn--sm">
                      Learn more
                    </Link>
                  </div>
                </div>
              ) : (
                <dl className="dl">
                  {account.licenses.map((lic) => (
                    <div key={lic.id}>
                      <dt className="mono">{lic.license_key}</dt>
                      <dd>
                        <span className="pill pill--accent">{lic.plan_tier}</span>{" "}
                        <span className="pill pill--ok">{lic.status}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
