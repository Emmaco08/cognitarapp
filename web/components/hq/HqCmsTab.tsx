"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type CmsSubTab = "blog" | "guide" | "faq" | "roadmap" | "changelog" | "pages";

interface CmsEntry {
  id: string;
  section: "blog" | "guide" | "faq" | "roadmap" | "changelog" | "page";
  slug: string;
  title: string;
  category: string;
  status: string;
  summary: string;
  body_json: Record<string, any>;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

const GUIDE_CATEGORY_OPTIONS = [
  "Get started",
  "Exam day & recovery",
  "Authoring & STEM",
  "Networking & Wi-Fi",
  "Data & backups",
  "Licensing",
];

const BLOG_CATEGORY_OPTIONS = [
  "Exam Reliability",
  "Engineering",
  "Releases",
  "Migration",
  "Guides",
];

const FAQ_CATEGORY_OPTIONS = [
  "Offline & Exam Reliability",
  "Student Devices & Anti-Cheat",
  "Data Ownership & Backups",
  "Pricing, Trials & Licensing",
];

const ROADMAP_STATUS_OPTIONS = [
  { value: "in_progress", label: "In progress" },
  { value: "planned", label: "Planned" },
  { value: "shipped", label: "Shipped" },
  { value: "exploring", label: "Exploring" },
];

function sectionsToMarkdown(sections: any): string {
  if (!Array.isArray(sections)) return "";
  const out: string[] = [];
  for (const s of sections) {
    if (s?.heading) out.push(`## ${s.heading}`);
    if (Array.isArray(s?.paragraphs)) {
      for (const p of s.paragraphs) {
        if (p && String(p).trim()) out.push(String(p).trim());
      }
    }
  }
  return out.join("\n\n");
}

function linesToString(arr: any): string {
  if (!Array.isArray(arr)) return "";
  return arr.map((v) => String(v || "").trim()).filter(Boolean).join("\n");
}

export function HqCmsTab({ onToast }: { onToast: (msg: string) => void }) {
  const [subTab, setSubTab] = useState<CmsSubTab>("blog");
  const [entries, setEntries] = useState<CmsEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Composer / editor state
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("in_progress");
  const [summary, setSummary] = useState("");
  const [published, setPublished] = useState(true);
  const [sortOrder, setSortOrder] = useState("20");

  // Section-specific fields
  const [author, setAuthor] = useState("Emmanuel");
  const [dateText, setDateText] = useState("");
  const [readTime, setReadTime] = useState("3 min read");
  const [markdown, setMarkdown] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [tipText, setTipText] = useState("");
  const [targetRelease, setTargetRelease] = useState("v2.4");
  const [versionText, setVersionText] = useState("v2.3.6");
  const [newItemsText, setNewItemsText] = useState("");
  const [improvedItemsText, setImprovedItemsText] = useState("");
  const [fixedItemsText, setFixedItemsText] = useState("");

  // About & Support page editors
  const [aboutBadge, setAboutBadge] = useState("Story");
  const [aboutTitle, setAboutTitle] = useState("");
  const [aboutLead, setAboutLead] = useState("");
  const [aboutParagraphs, setAboutParagraphs] = useState("");
  const [aboutSigName, setAboutSigName] = useState("Emmanuel");
  const [aboutSigRole, setAboutSigRole] = useState("Founder & Lead Engineer");
  const [aboutContactNote, setAboutContactNote] = useState("");

  const [supBadge, setSupBadge] = useState("Get support");
  const [supTitle, setSupTitle] = useState("");
  const [supLead, setSupLead] = useState("");
  const [supEmail, setSupEmail] = useState("support@cognitara.net");
  const [supResponse, setSupResponse] = useState("");
  const [supChecklist, setSupChecklist] = useState("");

  async function loadCms() {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/hq/cms", { credentials: "include" }).then((r) => r.json()).catch(() => null);
      if (res?.ok) {
        const list: CmsEntry[] = res.entries || [];
        setEntries(list);
        setCounts(res.counts || {});

        const aboutRow = list.find((e) => e.section === "page" && e.slug === "about");
        if (aboutRow) {
          const b = aboutRow.body_json || {};
          setAboutBadge(String(b.badge || "Story"));
          setAboutTitle(String(aboutRow.title || b.title || ""));
          setAboutLead(String(aboutRow.summary || b.lead || ""));
          setAboutParagraphs(Array.isArray(b.paragraphs) ? b.paragraphs.join("\n\n") : "");
          setAboutSigName(String(b.signatureName || "Emmanuel"));
          setAboutSigRole(String(b.signatureRole || "Founder & Lead Engineer"));
          setAboutContactNote(String(b.contactNote || ""));
        }

        const supRow = list.find((e) => e.section === "page" && e.slug === "support");
        if (supRow) {
          const b = supRow.body_json || {};
          setSupBadge(String(b.badge || "Get support"));
          setSupTitle(String(supRow.title || b.title || ""));
          setSupLead(String(supRow.summary || b.lead || ""));
          setSupEmail(String(b.email || "support@cognitara.net"));
          setSupResponse(String(b.responseWindow || ""));
          setSupChecklist(linesToString(b.bugChecklist));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCms();
  }, []);

  const currentItems = useMemo(() => {
    if (subTab === "pages") return [];
    return entries.filter((e) => e.section === subTab);
  }, [entries, subTab]);

  function openNewComposer() {
    if (subTab === "pages") return;
    setEditingId(null);
    setTitle("");
    setSlug("");
    setSummary("");
    setPublished(true);
    setSortOrder(String((currentItems.length + 1) * 10));
    setAuthor("Emmanuel");
    setDateText(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    setReadTime(subTab === "guide" ? "3 min" : "4 min read");
    setMarkdown("");
    setStepsText("");
    setTipText("");
    setTargetRelease("v2.4");
    setVersionText("v2.4.0");
    setNewItemsText("");
    setImprovedItemsText("");
    setFixedItemsText("");

    if (subTab === "blog") setCategory(BLOG_CATEGORY_OPTIONS[0]);
    else if (subTab === "guide") setCategory(GUIDE_CATEGORY_OPTIONS[0]);
    else if (subTab === "faq") setCategory(FAQ_CATEGORY_OPTIONS[0]);
    else if (subTab === "roadmap") {
      setCategory("Exam Reliability");
      setStatus("planned");
    } else if (subTab === "changelog") {
      setCategory("v2.4.0");
      setDateText(new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
    }
    setComposerOpen(true);
  }

  function openEditComposer(item: CmsEntry) {
    const b = item.body_json || {};
    setEditingId(item.id);
    setTitle(item.title || "");
    setSlug(item.slug || "");
    setCategory(item.category || "");
    setStatus(item.status || "planned");
    setSummary(item.section === "faq" ? String(b.answer || item.summary || "") : item.summary || "");
    setPublished(Boolean(item.published));
    setSortOrder(String(item.sort_order ?? 100));

    setAuthor(String(b.author || "Emmanuel"));
    setDateText(String(b.date || ""));
    setReadTime(String(b.readTime || (item.section === "guide" ? "3 min" : "3 min read")));
    setMarkdown(sectionsToMarkdown(b.sections));
    setStepsText(linesToString(b.steps));
    setTipText(String(b.tip || ""));
    setTargetRelease(String(b.target || "v2.4"));
    setVersionText(String(b.version || item.category || "v2.3.6"));
    setNewItemsText(linesToString(b.newItems));
    setImprovedItemsText(linesToString(b.improvedItems));
    setFixedItemsText(linesToString(b.fixedItems));
    setComposerOpen(true);
  }

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    if (subTab === "pages") return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        action: editingId ? "update" : "create",
        id: editingId || undefined,
        section: subTab,
        title: title.trim(),
        slug: slug.trim() || undefined,
        category: subTab === "changelog" ? versionText.trim() : category.trim(),
        status: subTab === "roadmap" ? status : published ? "published" : "draft",
        summary: summary.trim(),
        answer: subTab === "faq" ? summary.trim() : undefined,
        published,
        sort_order: Number(sortOrder || 100),
      };

      if (subTab === "blog") {
        payload.author = author.trim();
        payload.date = dateText.trim();
        payload.read_time = readTime.trim();
        payload.markdown = markdown;
      } else if (subTab === "guide") {
        payload.read_time = readTime.trim();
        payload.steps = stepsText;
        payload.tip = tipText.trim();
      } else if (subTab === "roadmap") {
        payload.target = targetRelease.trim();
      } else if (subTab === "changelog") {
        payload.version = versionText.trim();
        payload.date = dateText.trim();
        payload.new_items = newItemsText;
        payload.improved_items = improvedItemsText;
        payload.fixed_items = fixedItemsText;
      }

      const res = await fetch("/api/v1/hq/cms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      onToast(res?.message || (res?.ok ? "Saved." : "Save failed."));
      if (res?.ok) {
        setComposerOpen(false);
        setEditingId(null);
        await loadCms();
      }
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(id: string) {
    const res = await fetch("/api/v1/hq/cms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_published", id }),
    }).then((r) => r.json());
    onToast(res?.message || "Updated.");
    await loadCms();
  }

  async function deleteEntry(id: string, itemTitle: string) {
    if (!window.confirm(`Delete "${itemTitle}" permanently?`)) return;
    const res = await fetch("/api/v1/hq/cms", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    }).then((r) => r.json());
    onToast(res?.message || "Deleted.");
    await loadCms();
  }

  async function savePage(slugKey: "about" | "support", e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body =
        slugKey === "about"
          ? {
              action: "save_page",
              slug: "about",
              badge: aboutBadge.trim(),
              title: aboutTitle.trim(),
              lead: aboutLead.trim(),
              paragraphs: aboutParagraphs,
              signature_name: aboutSigName.trim(),
              signature_role: aboutSigRole.trim(),
              contact_note: aboutContactNote.trim(),
            }
          : {
              action: "save_page",
              slug: "support",
              badge: supBadge.trim(),
              title: supTitle.trim(),
              lead: supLead.trim(),
              email: supEmail.trim(),
              response_window: supResponse.trim(),
              bug_checklist: supChecklist,
            };

      const res = await fetch("/api/v1/hq/cms", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
      onToast(res?.message || "Saved.");
      await loadCms();
    } finally {
      setSaving(false);
    }
  }

  const publicLinkMap: Record<CmsSubTab, { href: string; label: string }> = {
    blog: { href: "/blog", label: "View /blog" },
    guide: { href: "/guides", label: "View /guides" },
    faq: { href: "/faq", label: "View /faq" },
    roadmap: { href: "/roadmap", label: "View /roadmap" },
    changelog: { href: "/changelogs", label: "View /changelogs" },
    pages: { href: "/about", label: "View /about" },
  };

  const tabLabels: { id: CmsSubTab; label: string; count?: number }[] = [
    { id: "blog", label: "Blog", count: counts.blog || 0 },
    { id: "guide", label: "Guides", count: counts.guide || 0 },
    { id: "faq", label: "FAQ", count: counts.faq || 0 },
    { id: "roadmap", label: "Roadmap", count: counts.roadmap || 0 },
    { id: "changelog", label: "Updates", count: counts.changelog || 0 },
    { id: "pages", label: "Story & Support", count: 2 },
  ];

  const newButtonLabel: Record<Exclude<CmsSubTab, "pages">, string> = {
    blog: "+ New blog post",
    guide: "+ New guide",
    faq: "+ New FAQ",
    roadmap: "+ New milestone",
    changelog: "+ New release",
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div className="hq-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>Website CMS</h1>
          <p>
            Create, edit, publish, or hide live articles, guides, FAQs, roadmap items, release updates, Story copy, and Support details without redeploying code.
          </p>
        </div>
        <div className="hq-btn-row">
          <Link href={publicLinkMap[subTab].href} target="_blank" className="btn btn--ghost btn--sm">
            {publicLinkMap[subTab].label} ↗
          </Link>
          {subTab !== "pages" ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={openNewComposer}>
              {newButtonLabel[subTab]}
            </button>
          ) : null}
        </div>
      </div>

      <div className="hq-kpi-strip">
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Blog posts</span>
          <span className="hq-kpi__val">{counts.blog || 0}</span>
          <span className="hq-kpi__sub">/blog &amp; /blog/[slug]</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">How-to guides</span>
          <span className="hq-kpi__val">{counts.guide || 0}</span>
          <span className="hq-kpi__sub">6 categories on /guides</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">FAQ answers</span>
          <span className="hq-kpi__val">{counts.faq || 0}</span>
          <span className="hq-kpi__sub">Grouped on /faq</span>
        </div>
        <div className="hq-kpi">
          <span className="hq-kpi__lbl">Roadmap &amp; Updates</span>
          <span className="hq-kpi__val">{(counts.roadmap || 0) + (counts.changelog || 0)}</span>
          <span className="hq-kpi__sub">/roadmap &amp; /changelogs</span>
        </div>
      </div>

      <div className="hq-toolbar">
        <div className="hq-chips">
          {tabLabels.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`hq-chip ${subTab === t.id ? "is-active" : ""}`}
              onClick={() => {
                setSubTab(t.id);
                setComposerOpen(false);
                setEditingId(null);
              }}
            >
              {t.label}
              {t.count !== undefined ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost btn--xs" onClick={() => void loadCms()}>
          Refresh
        </button>
      </div>

      {/* Inline Composer / Editor for Blog, Guides, FAQ, Roadmap, Changelog */}
      {composerOpen && subTab !== "pages" ? (
        <section className="card" style={{ display: "grid", gap: 14 }}>
          <div className="hq-toolbar" style={{ marginBottom: 0 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>
              {editingId ? "Edit entry" : newButtonLabel[subTab].replace("+ ", "")}
            </h2>
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              onClick={() => {
                setComposerOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>

          <form onSubmit={submitEntry} style={{ display: "grid", gap: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <label className="field">
                <span>{subTab === "faq" ? "Question" : "Title"}</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Enter headline or question…" />
              </label>

              {subTab === "changelog" ? (
                <label className="field">
                  <span>Release version</span>
                  <input value={versionText} onChange={(e) => setVersionText(e.target.value)} required placeholder="e.g. v2.4.0" />
                </label>
              ) : (
                <label className="field">
                  <span>Category</span>
                  <input
                    list={`cms-cat-${subTab}`}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Select or type a category…"
                  />
                  <datalist id={`cms-cat-${subTab}`}>
                    {(subTab === "blog"
                      ? BLOG_CATEGORY_OPTIONS
                      : subTab === "guide"
                        ? GUIDE_CATEGORY_OPTIONS
                        : subTab === "faq"
                          ? FAQ_CATEGORY_OPTIONS
                          : ["Exam Reliability", "Assessment", "Invigilation", "Authoring", "Reporting", "Design Craft"]
                    ).map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </label>
              )}

              {subTab === "roadmap" ? (
                <label className="field">
                  <span>Status</span>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    {ROADMAP_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {subTab === "roadmap" ? (
                <label className="field">
                  <span>Target release</span>
                  <input value={targetRelease} onChange={(e) => setTargetRelease(e.target.value)} placeholder="e.g. v2.4 or Live in v2.3.5" />
                </label>
              ) : null}

              {subTab === "blog" || subTab === "changelog" ? (
                <label className="field">
                  <span>Publish date</span>
                  <input value={dateText} onChange={(e) => setDateText(e.target.value)} placeholder="Nov 27, 2026" />
                </label>
              ) : null}

              {subTab === "blog" ? (
                <label className="field">
                  <span>Author</span>
                  <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Emmanuel" />
                </label>
              ) : null}

              {subTab === "blog" || subTab === "guide" ? (
                <label className="field">
                  <span>Read time</span>
                  <input value={readTime} onChange={(e) => setReadTime(e.target.value)} placeholder="3 min" />
                </label>
              ) : null}

              <label className="field">
                <span>URL slug (optional)</span>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto-generated-from-title" />
              </label>

              <label className="field">
                <span>Display order (lower = top)</span>
                <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </label>
            </div>

            <label className="field">
              <span>{subTab === "faq" ? "Answer" : subTab === "blog" ? "Excerpt (shown on /blog list)" : "Summary / Description"}</span>
              <textarea
                rows={subTab === "faq" ? 4 : 2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                placeholder={subTab === "faq" ? "Write a plain, clear answer…" : "Concise 1-2 sentence overview…"}
              />
            </label>

            {subTab === "blog" ? (
              <label className="field">
                <span>Article body (separate paragraphs with a blank line; start headings with ## )</span>
                <textarea
                  rows={9}
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  placeholder={"Opening paragraph...\n\n## Section heading\n\nDetailed explanation..."}
                />
              </label>
            ) : null}

            {subTab === "guide" ? (
              <>
                <label className="field">
                  <span>Step-by-step instructions (one step per line)</span>
                  <textarea
                    rows={6}
                    value={stepsText}
                    onChange={(e) => setStepsText(e.target.value)}
                    placeholder={"Install CogniTara Studio on your Windows host PC.\nConnect the PC to your school Wi-Fi router via Ethernet."}
                  />
                </label>
                <label className="field">
                  <span>Optional Lab Tip</span>
                  <input value={tipText} onChange={(e) => setTipText(e.target.value)} placeholder="Practical exam-day advice shown below steps…" />
                </label>
              </>
            ) : null}

            {subTab === "changelog" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <label className="field">
                  <span>New (one bullet per line)</span>
                  <textarea rows={4} value={newItemsText} onChange={(e) => setNewItemsText(e.target.value)} placeholder="Feature 1..." />
                </label>
                <label className="field">
                  <span>Improved (one bullet per line)</span>
                  <textarea rows={4} value={improvedItemsText} onChange={(e) => setImprovedItemsText(e.target.value)} placeholder="Improvement 1..." />
                </label>
                <label className="field">
                  <span>Fixed (one bullet per line)</span>
                  <textarea rows={4} value={fixedItemsText} onChange={(e) => setFixedItemsText(e.target.value)} placeholder="Fix 1..." />
                </label>
              </div>
            ) : null}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
                <span>Published live on cognitara.net</span>
              </label>
              <div className="hq-btn-row">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setComposerOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Publish entry"}
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {/* Pages Editor (About + Support) */}
      {subTab === "pages" ? (
        <div style={{ display: "grid", gap: 18 }}>
          <section className="card" style={{ display: "grid", gap: 14 }}>
            <div className="hq-toolbar" style={{ marginBottom: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>Story page (/about)</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-3)" }}>
                  Edit the founder letter, headline, signature, and contact line shown on cognitara.net/about.
                </p>
              </div>
              <Link href="/about" target="_blank" className="btn btn--ghost btn--xs">
                Open /about ↗
              </Link>
            </div>
            <form onSubmit={(e) => void savePage("about", e)} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <label className="field">
                  <span>Top pill badge</span>
                  <input value={aboutBadge} onChange={(e) => setAboutBadge(e.target.value)} />
                </label>
                <label className="field">
                  <span>Headline</span>
                  <input value={aboutTitle} onChange={(e) => setAboutTitle(e.target.value)} required />
                </label>
              </div>
              <label className="field">
                <span>Subtitle lead</span>
                <input value={aboutLead} onChange={(e) => setAboutLead(e.target.value)} />
              </label>
              <label className="field">
                <span>Story paragraphs (separate each paragraph with a blank line)</span>
                <textarea rows={9} value={aboutParagraphs} onChange={(e) => setAboutParagraphs(e.target.value)} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                <label className="field">
                  <span>Signature name</span>
                  <input value={aboutSigName} onChange={(e) => setAboutSigName(e.target.value)} />
                </label>
                <label className="field">
                  <span>Signature role</span>
                  <input value={aboutSigRole} onChange={(e) => setAboutSigRole(e.target.value)} />
                </label>
                <label className="field">
                  <span>Bottom contact note</span>
                  <input value={aboutContactNote} onChange={(e) => setAboutContactNote(e.target.value)} />
                </label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
                  {saving ? "Saving…" : "Save Story page"}
                </button>
              </div>
            </form>
          </section>

          <section className="card" style={{ display: "grid", gap: 14 }}>
            <div className="hq-toolbar" style={{ marginBottom: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>Support page (/support)</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-3)" }}>
                  Edit support email address, response window, and bug-reporting checklist shown on cognitara.net/support.
                </p>
              </div>
              <Link href="/support" target="_blank" className="btn btn--ghost btn--xs">
                Open /support ↗
              </Link>
            </div>
            <form onSubmit={(e) => void savePage("support", e)} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <label className="field">
                  <span>Top pill badge</span>
                  <input value={supBadge} onChange={(e) => setSupBadge(e.target.value)} />
                </label>
                <label className="field">
                  <span>Headline</span>
                  <input value={supTitle} onChange={(e) => setSupTitle(e.target.value)} required />
                </label>
                <label className="field">
                  <span>Support email</span>
                  <input type="email" value={supEmail} onChange={(e) => setSupEmail(e.target.value)} required />
                </label>
              </div>
              <label className="field">
                <span>Intro lead</span>
                <input value={supLead} onChange={(e) => setSupLead(e.target.value)} />
              </label>
              <label className="field">
                <span>Response time note</span>
                <input value={supResponse} onChange={(e) => setSupResponse(e.target.value)} />
              </label>
              <label className="field">
                <span>Bug-report checklist (one item per line)</span>
                <textarea rows={4} value={supChecklist} onChange={(e) => setSupChecklist(e.target.value)} />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
                  {saving ? "Saving…" : "Save Support page"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : loading ? (
        <div className="card" style={{ textAlign: "center", padding: 36, color: "var(--ink-3)" }}>
          Loading CMS content…
        </div>
      ) : (
        <div className="hq-table-wrap">
          <table className="hq-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>{subTab === "changelog" ? "Version" : "Category"}</th>
                <th>{subTab === "roadmap" ? "Milestone status" : "Visibility"}</th>
                <th>Order</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--ink-3)" }}>
                    No entries in this section yet. Click {newButtonLabel[subTab]} to add one.
                  </td>
                </tr>
              ) : (
                currentItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                        /{item.section === "blog" ? `blog/${item.slug}` : item.slug}
                        {item.body_json?.target ? ` · ${item.body_json.target}` : ""}
                        {item.body_json?.date ? ` · ${item.body_json.date}` : ""}
                      </div>
                    </td>
                    <td>{item.category || "-"}</td>
                    <td>
                      <span className={`status-txt ${item.published ? "status-txt--ok" : "status-txt--warn"}`}>
                        {subTab === "roadmap"
                          ? `${item.status.replace("_", " ")} (${item.published ? "live" : "hidden"})`
                          : item.published
                            ? "Published"
                            : "Draft"}
                      </span>
                    </td>
                    <td className="mono">{item.sort_order}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="hq-btn-row" style={{ justifyContent: "flex-end" }}>
                        <button type="button" className="btn btn--ghost btn--xs" onClick={() => openEditComposer(item)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn--ghost btn--xs" onClick={() => void togglePublished(item.id)}>
                          {item.published ? "Hide" : "Publish"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--xs"
                          onClick={() => void deleteEntry(item.id, item.title)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
