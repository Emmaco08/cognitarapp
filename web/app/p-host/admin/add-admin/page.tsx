"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

export default function AdminAddAdminPage() {
  const router = useRouter();
  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [admins, setAdmins] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [cRes, rRes] = await Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch("/api/v1/portal/roster", { credentials: "include" }),
    ]);
    if (rRes.status === 401 || rRes.status === 403) {
      router.replace("/");
      return;
    }
    const c = cRes.ok ? await cRes.json() : null;
    const r = await rRes.json();
    if (c?.ok) setSchool(c.school);
    if (r?.ok) setAdmins(r.admins || []);
  }, [router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      showCtToast("Password must be at least 6 characters.", "bad");
      return;
    }
    if (password !== confirmPw) {
      showCtToast("Passwords do not match.", "bad");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind: "admin", username: username.trim(), password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not create administrator.", "bad");
        return;
      }
      showCtToast(json.message || "Administrator created.", "ok");
      setUsername("");
      setPassword("");
      setConfirmPw("");
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const deleteAdmin = async (adm: any) => {
    if (!window.confirm(`Remove administrator "${adm.username}"?`)) return;
    const res = await fetch(`/api/v1/portal/roster?kind=admin&local_id=${adm.local_id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = await res.json();
    if (res.ok && json.ok) {
      showCtToast("Administrator removed.", "ok");
      await loadData();
    } else {
      showCtToast(json.message || "Could not delete administrator.", "bad");
    }
  };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="add_admin" crumb="Administrators" school={school}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Access Control &amp; Governance</span>
            <h1>School Administrators</h1>
            <p>Provision delegated exam officers or remove inactive administrator credentials.</p>
          </div>
        </header>

        <div className="adm-grid">
          <section className="af-card">
            <div className="af-head">
              <h2>Create Administrator</h2>
              <p>Grants full oversight across exams, rosters, settings, and server toggles.</p>
            </div>
            <form onSubmit={createAdmin}>
              <div style={{ padding: 20, display: "grid", gap: 14 }}>
                <div className="af-field">
                  <label className="af-label"><span>Admin Username<span className="af-req">*</span></span></label>
                  <input
                    className="af-input"
                    placeholder="e.g. exam_officer"
                    minLength={3}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="af-field">
                  <label className="af-label"><span>Password<span className="af-req">*</span></span></label>
                  <input
                    type="password"
                    className="af-input"
                    placeholder="Minimum 6 characters"
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="af-field">
                  <label className="af-label"><span>Confirm Password<span className="af-req">*</span></span></label>
                  <input
                    type="password"
                    className="af-input"
                    placeholder="Repeat password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="af-foot">
                <button type="submit" className="tc-btn tc-btn--primary" disabled={saving}>
                  <CtIco name="i-shield" className="ct-ico--sm" />
                  {saving ? "Creating..." : "Create Administrator"}
                </button>
              </div>
            </form>
          </section>

          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Active Administrators ({admins.length})</h2>
                <p>Cannot delete your own active account or the final remaining administrator</p>
              </div>
            </div>
            <div className="tc-table-wrap">
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>ID</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.local_id}>
                      <td><strong>{a.username}</strong></td>
                      <td className="tc-mono">#{a.local_id}</td>
                      <td>
                        <div className="tc-actions">
                          <button
                            type="button"
                            className="tc-btn tc-btn--ghost tc-btn--icon"
                            style={{ color: "var(--tc-bad)" }}
                            disabled={admins.length <= 1}
                            onClick={() => void deleteAdmin(a)}
                            title="Delete administrator"
                          >
                            <CtIco name="i-trash" className="ct-ico--sm" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </AdminShell>
    </div>
  );
}
