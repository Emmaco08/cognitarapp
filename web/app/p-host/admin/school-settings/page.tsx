"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

interface GradeRule {
  grade_label: string;
  min_percentage: number;
  max_percentage: number;
  remark: string;
}

const WAEC_PRESET: GradeRule[] = [
  { grade_label: "A1", min_percentage: 75, max_percentage: 100, remark: "Excellent" },
  { grade_label: "B2", min_percentage: 70, max_percentage: 74.99, remark: "Very Good" },
  { grade_label: "B3", min_percentage: 65, max_percentage: 69.99, remark: "Good" },
  { grade_label: "C4", min_percentage: 60, max_percentage: 64.99, remark: "Credit" },
  { grade_label: "C5", min_percentage: 55, max_percentage: 59.99, remark: "Credit" },
  { grade_label: "C6", min_percentage: 50, max_percentage: 54.99, remark: "Credit" },
  { grade_label: "D7", min_percentage: 45, max_percentage: 49.99, remark: "Pass" },
  { grade_label: "E8", min_percentage: 40, max_percentage: 44.99, remark: "Pass" },
  { grade_label: "F9", min_percentage: 0, max_percentage: 39.99, remark: "Fail" },
];

const LETTER_PRESET: GradeRule[] = [
  { grade_label: "A", min_percentage: 80, max_percentage: 100, remark: "Distinction" },
  { grade_label: "B", min_percentage: 70, max_percentage: 79.99, remark: "Very Good" },
  { grade_label: "C", min_percentage: 60, max_percentage: 69.99, remark: "Credit" },
  { grade_label: "D", min_percentage: 50, max_percentage: 59.99, remark: "Pass" },
  { grade_label: "F", min_percentage: 0, max_percentage: 49.99, remark: "Fail" },
];

export default function AdminSchoolSettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"identity" | "classes" | "grading" | "release">("identity");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [schoolName, setSchoolName] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [motto, setMotto] = useState("");
  const [sessionStr, setSessionStr] = useState("2026/2027");
  const [term, setTerm] = useState("First Term");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoB64, setLogoB64] = useState("");
  const [antiCheat, setAntiCheat] = useState("medium");
  const [maxWarnings, setMaxWarnings] = useState(5);
  const [defaultVis, setDefaultVis] = useState("immediate");

  const [classes, setClasses] = useState<string[]>([]);
  const [newClass, setNewClass] = useState("");

  const [schemeName, setSchemeName] = useState("WAEC 9-Point");
  const [schemeDesc, setSchemeDesc] = useState("");
  const [rules, setRules] = useState<GradeRule[]>(WAEC_PRESET);
  const [simScore, setSimScore] = useState(74);

  const [exams, setExams] = useState<any[]>([]);
  const [selectedExams, setSelectedExams] = useState<number[]>([]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/portal/settings", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        router.replace("/");
        return;
      }
      const json = await res.json();
      if (json.ok && json.settings) {
        const s = json.settings;
        setSchoolName(s.school_name || "");
        setSchoolCode(s.school_code || "");
        setMotto(s.school_motto || "");
        setSessionStr(s.academic_session || "2026/2027");
        setTerm(s.current_term || "First Term");
        setEmail(s.school_email || "");
        setPhone(s.school_phone || "");
        setAddress(s.school_address || "");
        setLogoB64(s.school_logo_b64 || "");
        setAntiCheat(s.anti_cheating_profile || "medium");
        setMaxWarnings(Number(s.max_warnings || 5));
        setDefaultVis(s.default_result_visibility || "immediate");
        setClasses(s.classes || []);
        setSchemeName(s.grading_scheme_name || "WAEC 9-Point");
        setSchemeDesc(s.grading_scheme_desc || "");
        setRules(Array.isArray(s.grading_rules) && s.grading_rules.length ? s.grading_rules : WAEC_PRESET);
        setExams(json.exams || []);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const postSettings = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/portal/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        showCtToast(json.message || "Saved.", "ok");
        return json;
      }
      showCtToast(json.message || "Update failed.", "bad");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleLogoFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      showCtToast("Please upload a PNG, JPG, or WEBP image.", "bad");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = String(ev.target?.result || "");
      setLogoB64(b64);
      await postSettings({ action: "update_logo", school_logo_b64: b64 });
    };
    reader.readAsDataURL(file);
  };

  const simulatedGrade = (() => {
    const sorted = [...rules].sort((a, b) => Number(b.min_percentage) - Number(a.min_percentage));
    for (const r of sorted) {
      if (simScore >= Number(r.min_percentage)) return r;
    }
    return sorted[sorted.length - 1] || { grade_label: "F", remark: "Fail" };
  })();

  const schoolMeta: OfflineSchoolMeta = {
    school_name: schoolName || "CogniTara School",
    school_code: schoolCode,
    academic_session: sessionStr,
    current_term: term,
    school_logo_b64: logoB64,
  };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="settings" crumb="School Settings" school={schoolMeta}>
        <header className="tc-head">
          <div className="tc-head__txt">
            <span className="tc-eyebrow">Institutional Configuration Studio</span>
            <h1>School Settings</h1>
            <p>Manage branding, active term, class structures, grading rules, and result release visibility.</p>
          </div>
        </header>

        {/* Exact Offline 4-Tab Bar (.ss-tabs) */}
        <div className="ss-tabs" role="tablist">
          {(
            [
              { id: "identity", label: "Identity & Session", icon: "i-settings" },
              { id: "classes", label: "Class Structure", icon: "i-layers" },
              { id: "grading", label: "Grading Scheme", icon: "i-chart" },
              { id: "release", label: "Result Release", icon: "i-unlock" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`ss-tab${tab === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <CtIco name={t.icon} className="ct-ico--sm" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="tc-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
            Loading school settings...
          </div>
        ) : tab === "identity" ? (
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>School Identity, Session &amp; Integrity Policy</h2>
                <p>Displayed across Student, Teacher, and Admin portals and score slips</p>
              </div>
            </div>
            <div className="tc-card__body">
              <form
                className="tc-form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await postSettings({
                    action: "update_general",
                    school_name: schoolName,
                    school_motto: motto,
                    academic_session: sessionStr,
                    current_term: term,
                    school_email: email,
                    school_phone: phone,
                    school_address: address,
                    anti_cheating_profile: antiCheat,
                    max_warnings: maxWarnings,
                    default_result_visibility: defaultVis,
                  });
                }}
              >
                {/* School Crest / Logo Upload */}
                <div className="af-photo-row" style={{ marginBottom: 4 }}>
                  <span className="af-photo-preview" style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden", display: "grid", placeItems: "center", border: "1px solid var(--tc-line-2)" }}>
                    {logoB64 ? <img src={logoB64} alt="School Crest" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <CtIco name="i-shield" />}
                  </span>
                  <div style={{ display: "grid", gap: 6 }}>
                    <strong style={{ fontSize: 13.5 }}>School Crest / Logo</strong>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <label className="tc-btn tc-btn--secondary tc-btn--sm" style={{ cursor: "pointer" }}>
                        Upload Logo
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLogoFile(f);
                          }}
                        />
                      </label>
                      {logoB64 && (
                        <button
                          type="button"
                          className="tc-btn tc-btn--ghost tc-btn--sm"
                          onClick={async () => {
                            setLogoB64("");
                            await postSettings({ action: "update_logo", school_logo_b64: "" });
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">School Name</label>
                    <input className="tc-input" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} required />
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">School Motto</label>
                    <input className="tc-input" value={motto} onChange={(e) => setMotto(e.target.value)} placeholder="Excellence in Knowledge" />
                  </div>
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">Academic Session</label>
                    <input className="tc-input" value={sessionStr} onChange={(e) => setSessionStr(e.target.value)} />
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">Current Term</label>
                    <select className="tc-select" value={term} onChange={(e) => setTerm(e.target.value)}>
                      <option value="First Term">First Term</option>
                      <option value="Second Term">Second Term</option>
                      <option value="Third Term">Third Term</option>
                    </select>
                  </div>
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">Contact Email</label>
                    <input type="email" className="tc-input" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">Contact Phone</label>
                    <input className="tc-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>

                <div className="tc-field">
                  <label className="tc-label">School Address</label>
                  <input className="tc-input" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>

                <div className="tc-form-row2">
                  <div className="tc-field">
                    <label className="tc-label">Anti-Cheating Strictness</label>
                    <select className="tc-select" value={antiCheat} onChange={(e) => setAntiCheat(e.target.value)}>
                      <option value="low">Low (Focus notices only)</option>
                      <option value="medium">Medium (Tab &amp; Copy protection)</option>
                      <option value="high">High (Strict warning threshold)</option>
                    </select>
                  </div>
                  <div className="tc-field">
                    <label className="tc-label">Default Max Warnings</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="tc-input tc-mono"
                      value={maxWarnings}
                      onChange={(e) => setMaxWarnings(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="tc-field">
                  <label className="tc-label">Default Result Release Policy</label>
                  <select className="tc-select" value={defaultVis} onChange={(e) => setDefaultVis(e.target.value)}>
                    <option value="immediate">Immediate score shown on submission</option>
                    <option value="withheld">Withheld until admin or teacher releases</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="submit" className="tc-btn tc-btn--primary" disabled={saving}>
                    <CtIco name="i-save" className="ct-ico--sm" />
                    {saving ? "Saving..." : "Save General Settings"}
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : tab === "classes" ? (
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Academic Classes ({classes.length})</h2>
                <p>Apply a national curriculum preset or add custom class arms</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["nerdc", "british", "american"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="tc-btn tc-btn--secondary tc-btn--sm"
                    disabled={saving}
                    onClick={async () => {
                      const json = await postSettings({ action: "apply_class_preset", preset });
                      if (json?.classes) setClasses(json.classes);
                    }}
                  >
                    Apply {preset.toUpperCase()} Preset
                  </button>
                ))}
              </div>
            </div>
            <div className="tc-card__body" style={{ display: "grid", gap: 16 }}>
              <form
                style={{ display: "flex", gap: 10, maxWidth: 420 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newClass.trim()) return;
                  const json = await postSettings({ action: "add_class", class_name: newClass.trim() });
                  if (json?.classes) {
                    setClasses(json.classes);
                    setNewClass("");
                  }
                }}
              >
                <input
                  className="tc-input"
                  placeholder="Add custom class (e.g., SS 1 Gold)"
                  value={newClass}
                  onChange={(e) => setNewClass(e.target.value)}
                />
                <button type="submit" className="tc-btn tc-btn--primary" disabled={saving}>
                  Add
                </button>
              </form>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {classes.map((cls) => (
                  <span
                    key={cls}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--tc-line-2)",
                      background: "var(--tc-surface-2)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {cls}
                    <button
                      type="button"
                      onClick={async () => {
                        const json = await postSettings({ action: "delete_class", class_name: cls });
                        if (json?.classes) setClasses(json.classes);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tc-ink-3)", padding: 0 }}
                      aria-label={`Remove ${cls}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : tab === "grading" ? (
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Grading Scheme Studio</h2>
                <p>Configure grade tiers, load presets, and preview scores with the live simulator</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="tc-btn tc-btn--secondary tc-btn--sm"
                  onClick={() => {
                    setSchemeName("WAEC 9-Point");
                    setRules(WAEC_PRESET);
                  }}
                >
                  WAEC Preset
                </button>
                <button
                  type="button"
                  className="tc-btn tc-btn--secondary tc-btn--sm"
                  onClick={() => {
                    setSchemeName("Standard A-F");
                    setRules(LETTER_PRESET);
                  }}
                >
                  A-F Letter Preset
                </button>
              </div>
            </div>
            <div className="tc-card__body" style={{ display: "grid", gap: 18 }}>
              <div className="tc-form-row2">
                <div className="tc-field">
                  <label className="tc-label">Scheme Name</label>
                  <input className="tc-input" value={schemeName} onChange={(e) => setSchemeName(e.target.value)} />
                </div>
                <div className="tc-field">
                  <label className="tc-label">Description</label>
                  <input className="tc-input" value={schemeDesc} onChange={(e) => setSchemeDesc(e.target.value)} />
                </div>
              </div>

              {/* Live Score Simulator */}
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: 12,
                  border: "1px solid var(--tc-line-2)",
                  background: "var(--tc-surface-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <strong style={{ display: "block", fontSize: 13 }}>Live Grade Simulator: {simScore}%</strong>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={simScore}
                    onChange={(e) => setSimScore(Number(e.target.value))}
                    style={{ width: "100%", marginTop: 6 }}
                  />
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 11, color: "var(--tc-ink-3)", display: "block" }}>Computed Grade</span>
                  <strong className="tc-mono" style={{ fontSize: 22 }}>
                    {simulatedGrade.grade_label} · {simulatedGrade.remark}
                  </strong>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {rules.map((r, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "90px 100px 100px 1fr 38px", gap: 8, alignItems: "center" }}>
                    <input
                      className="tc-input tc-mono"
                      value={r.grade_label}
                      onChange={(e) =>
                        setRules((p) => p.map((x, i) => (i === idx ? { ...x, grade_label: e.target.value } : x)))
                      }
                      placeholder="A1"
                    />
                    <input
                      type="number"
                      className="tc-input tc-mono"
                      value={r.min_percentage}
                      onChange={(e) =>
                        setRules((p) =>
                          p.map((x, i) => (i === idx ? { ...x, min_percentage: Number(e.target.value) } : x))
                        )
                      }
                      placeholder="Min %"
                    />
                    <input
                      type="number"
                      className="tc-input tc-mono"
                      value={r.max_percentage}
                      onChange={(e) =>
                        setRules((p) =>
                          p.map((x, i) => (i === idx ? { ...x, max_percentage: Number(e.target.value) } : x))
                        )
                      }
                      placeholder="Max %"
                    />
                    <input
                      className="tc-input"
                      value={r.remark}
                      onChange={(e) =>
                        setRules((p) => p.map((x, i) => (i === idx ? { ...x, remark: e.target.value } : x)))
                      }
                      placeholder="Remark"
                    />
                    <button
                      type="button"
                      className="tc-btn tc-btn--ghost tc-btn--icon"
                      style={{ color: "var(--tc-bad)" }}
                      onClick={() => setRules((p) => p.filter((_, i) => i !== idx))}
                    >
                      <CtIco name="i-trash" className="ct-ico--sm" />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <button
                  type="button"
                  className="tc-btn tc-btn--secondary"
                  onClick={() =>
                    setRules((p) => [...p, { grade_label: "", min_percentage: 0, max_percentage: 39, remark: "" }])
                  }
                >
                  <CtIco name="i-plus" className="ct-ico--xs" />
                  Add Grade Tier
                </button>
                <button
                  type="button"
                  className="tc-btn tc-btn--primary"
                  disabled={saving}
                  onClick={() =>
                    void postSettings({
                      action: "save_grading",
                      grading_scheme_name: schemeName,
                      grading_scheme_desc: schemeDesc,
                      grading_rules: rules,
                    })
                  }
                >
                  <CtIco name="i-save" className="ct-ico--sm" />
                  Save &amp; Activate Grading Scale
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="tc-card">
            <div className="tc-card__head">
              <div className="tc-card__title">
                <h2>Bulk Result Release Control</h2>
                <p>Select examinations to release or withhold student score reports across the portal</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="tc-btn tc-btn--primary tc-btn--sm"
                  disabled={!selectedExams.length || saving}
                  onClick={async () => {
                    const ok = await postSettings({ action: "bulk_release_results", exam_ids: selectedExams, release: true });
                    if (ok) {
                      setSelectedExams([]);
                      await loadSettings();
                    }
                  }}
                >
                  Release Selected ({selectedExams.length})
                </button>
                <button
                  type="button"
                  className="tc-btn tc-btn--secondary tc-btn--sm"
                  disabled={!selectedExams.length || saving}
                  onClick={async () => {
                    const ok = await postSettings({ action: "bulk_release_results", exam_ids: selectedExams, release: false });
                    if (ok) {
                      setSelectedExams([]);
                      await loadSettings();
                    }
                  }}
                >
                  Withhold Selected
                </button>
              </div>
            </div>
            <div className="tc-table-wrap">
              <table className="tc-table ad-dash-table">
                <thead>
                  <tr>
                    <th style={{ width: 38 }}>
                      <input
                        type="checkbox"
                        checked={exams.length > 0 && selectedExams.length === exams.length}
                        onChange={(e) => setSelectedExams(e.target.checked ? exams.map((x) => x.local_id) : [])}
                      />
                    </th>
                    <th>Examination</th>
                    <th>Class</th>
                    <th className="is-center">Scripts</th>
                    <th style={{ textAlign: "right" }}>Visibility</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((ex) => (
                    <tr key={ex.local_id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedExams.includes(ex.local_id)}
                          onChange={(e) =>
                            setSelectedExams((p) =>
                              e.target.checked ? [...p, ex.local_id] : p.filter((id) => id !== ex.local_id)
                            )
                          }
                        />
                      </td>
                      <td><strong>{ex.name}</strong></td>
                      <td><span className="tc-pill">{ex.exam_class}</span></td>
                      <td className="tc-mono is-center">{ex.submitted_count || 0}</td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`tc-pill ${ex.results_released ? "tc-pill--ok" : "tc-pill--warn"}`}>
                          {ex.results_released ? "Released" : "Withheld"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </AdminShell>
    </div>
  );
}
