"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CtIco } from "@/components/portal/CtIco";
import { AdminShell, OfflineSchoolMeta, showCtToast } from "@/components/portal/OfflineShell";

export default function AdminEditStudentPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = Number(params?.studentId || 0);

  const [school, setSchool] = useState<OfflineSchoolMeta | null>(null);
  const [classes, setClasses] = useState<string[]>(["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]);
  const [loading, setLoading] = useState(true);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [specialisation, setSpecialisation] = useState("General");
  const [status, setStatus] = useState("approved");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/v1/portal/control", { credentials: "include" }),
      fetch(`/api/v1/portal/roster?single=student&local_id=${studentId}`, { credentials: "include" }),
    ])
      .then(async ([cRes, sRes]) => {
        if (sRes.status === 401 || sRes.status === 403) {
          router.replace("/");
          return;
        }
        const c = cRes.ok ? await cRes.json() : null;
        const s = await sRes.json();
        if (c?.ok) setSchool(c.school);
        if (s?.ok && s.student) {
          if (Array.isArray(s.classes) && s.classes.length) setClasses(s.classes);
          setUsername(s.student.username || "");
          setFullName(s.student.full_name || "");
          setEmail(s.student.email || "");
          setStudentClass(s.student.student_class || "");
          setSpecialisation(s.student.specialisation || "General");
          setStatus(s.student.status || "approved");
        }
      })
      .finally(() => setLoading(false));
  }, [studentId, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/portal/roster", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          kind: "student",
          local_id: studentId,
          full_name: fullName.trim(),
          email: email.trim(),
          student_class: studentClass,
          specialisation,
          status,
          password: password || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        showCtToast(json.message || "Could not update student.", "bad");
        return;
      }
      showCtToast("Student profile updated.", "ok");
      router.push("/admin#sec-students");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ct-app ad-studio">
      <AdminShell active="students" crumb={`Edit Student · ${fullName || username}`} school={school}>
        <div className="af-shell" style={{ maxWidth: 780 }}>
          <header className="tc-head">
            <div className="tc-head__txt">
              <span className="tc-eyebrow">Student Account Management</span>
              <h1>Edit Student</h1>
              <p>Update class placement, specialisation, status, or password for @{username}.</p>
            </div>
            <div className="tc-head__actions">
              <Link href={`/admin/student/${studentId}`} className="tc-btn tc-btn--secondary">
                View Academic Profile
              </Link>
              <Link href="/admin#sec-students" className="tc-btn tc-btn--secondary">
                <CtIco name="i-arrow-left" className="ct-ico--sm" />
                Back
              </Link>
            </div>
          </header>

          {loading ? (
            <div className="af-card" style={{ padding: 36, textAlign: "center", color: "var(--tc-ink-3)" }}>
              Loading student details...
            </div>
          ) : (
            <section className="af-card">
              <div className="af-head">
                <h2>@{username}</h2>
                <p>Leave password blank to keep the student&apos;s current password.</p>
              </div>
              <form onSubmit={handleSave}>
                <div style={{ padding: 22, display: "grid", gap: 18 }}>
                  <div className="af-grid">
                    <div className="af-field af-field--full">
                      <label className="af-label"><span>Full Name<span className="af-req">*</span></span></label>
                      <input className="af-input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                    </div>
                    <div className="af-field">
                      <label className="af-label"><span>Class<span className="af-req">*</span></span></label>
                      <select className="af-select" value={studentClass} onChange={(e) => setStudentClass(e.target.value)} required>
                        {classes.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="af-field">
                      <label className="af-label"><span>Specialisation</span></label>
                      <select className="af-select" value={specialisation} onChange={(e) => setSpecialisation(e.target.value)}>
                        <option value="General">General</option>
                        <option value="Science">Science</option>
                        <option value="Art">Art</option>
                        <option value="Commercial">Commercial</option>
                      </select>
                    </div>
                    <div className="af-field">
                      <label className="af-label"><span>Email</span></label>
                      <input type="email" className="af-input" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="af-field">
                      <label className="af-label"><span>Account Status</span></label>
                      <select className="af-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="approved">Approved</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                    <div className="af-field af-field--full">
                      <label className="af-label"><span>Reset Password (Optional)</span></label>
                      <input
                        type="password"
                        className="af-input"
                        placeholder="Leave blank to keep existing password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div className="af-foot">
                  <Link href="/admin#sec-students" className="tc-btn tc-btn--ghost">
                    Cancel
                  </Link>
                  <button type="submit" className="tc-btn tc-btn--primary" disabled={saving}>
                    <CtIco name="i-save" className="ct-ico--sm" />
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </AdminShell>
    </div>
  );
}
