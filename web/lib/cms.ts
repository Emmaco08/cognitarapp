import { getSql } from "@/lib/db";
import {
  ABOUT_PAGE_DEFAULT,
  BLOG_POSTS,
  CHANGELOG_RELEASES,
  FAQ_GROUPS,
  GUIDES_LIST,
  ROADMAP_ITEMS,
  SUPPORT_CHANNELS,
  type AboutPageContent,
  type BlogPost,
  type ChangelogRelease,
  type FaqCategory,
  type GuideItem,
  type RoadmapItem,
  type RoadmapStatus,
  type SupportPageContent,
} from "@/lib/site-content";

export type CmsSection = "blog" | "guide" | "faq" | "roadmap" | "changelog" | "page";

export interface CmsEntryRow {
  id: string;
  section: CmsSection;
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

let cmsTableEnsured = false;
const seededSections = new Set<CmsSection>();

export function slugifyCms(input: string, fallback = "item"): string {
  const cleaned = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return cleaned || `${fallback}-${Date.now().toString(36)}`;
}

export function parseMarkdownSections(raw: string): { heading?: string; paragraphs: string[] }[] {
  const blocks = String(raw || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const sections: { heading?: string; paragraphs: string[] }[] = [];
  let current: { heading?: string; paragraphs: string[] } = { paragraphs: [] };

  for (const block of blocks) {
    if (block.startsWith("## ") || block.startsWith("### ")) {
      if (current.heading || current.paragraphs.length > 0) {
        sections.push(current);
      }
      current = { heading: block.replace(/^#{2,3}\s+/, "").trim(), paragraphs: [] };
    } else {
      current.paragraphs.push(block);
    }
  }
  if (current.heading || current.paragraphs.length > 0) {
    sections.push(current);
  }
  return sections;
}

export function formatSectionsToMarkdown(sections: { heading?: string; paragraphs: string[] }[] | undefined): string {
  if (!Array.isArray(sections) || sections.length === 0) return "";
  const parts: string[] = [];
  for (const sec of sections) {
    if (sec.heading) parts.push(`## ${sec.heading}`);
    if (Array.isArray(sec.paragraphs)) {
      for (const p of sec.paragraphs) {
        if (p && p.trim()) parts.push(p.trim());
      }
    }
  }
  return parts.join("\n\n");
}

export async function ensureCmsTable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (cmsTableEnsured) return true;
  try {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS cms_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        section TEXT NOT NULL CHECK (section IN ('blog', 'guide', 'faq', 'roadmap', 'changelog', 'page')),
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'published',
        summary TEXT NOT NULL DEFAULT '',
        body_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        sort_order INTEGER NOT NULL DEFAULT 100,
        published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (section, slug)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_cms_entries_section ON cms_entries(section, published, sort_order, created_at DESC)`;
    cmsTableEnsured = true;
    return true;
  } catch (err) {
    console.warn("ensureCmsTable warning:", err);
    return false;
  }
}

export async function seedCmsSectionIfEmpty(section: CmsSection, forceMissing = false): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  if (!forceMissing && seededSections.has(section)) return;
  const ready = await ensureCmsTable();
  if (!ready) return;

  try {
    const sql = getSql();
    if (!forceMissing) {
      const existing = await sql`SELECT COUNT(*)::int AS cnt FROM cms_entries WHERE section = ${section}`;
      if (Number(existing[0]?.cnt || 0) > 0) {
        seededSections.add(section);
        return;
      }
    }

    if (section === "blog") {
      for (let i = 0; i < BLOG_POSTS.length; i++) {
        const p = BLOG_POSTS[i];
        const body = {
          date: p.date,
          author: p.author,
          authorInitials: p.authorInitials,
          readTime: p.readTime,
          sections: p.sections,
        };
        await sql`
          INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published)
          VALUES ('blog', ${p.slug}, ${p.title}, ${p.category}, 'published', ${p.excerpt}, ${JSON.stringify(body)}::jsonb, ${(i + 1) * 10}, TRUE)
          ON CONFLICT (section, slug) DO NOTHING
        `;
      }
    } else if (section === "guide") {
      for (let i = 0; i < GUIDES_LIST.length; i++) {
        const g = GUIDES_LIST[i];
        const body = {
          readTime: g.readTime,
          steps: g.steps,
          tip: g.tip || "",
        };
        await sql`
          INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published)
          VALUES ('guide', ${g.id}, ${g.title}, ${g.category}, 'published', ${g.summary}, ${JSON.stringify(body)}::jsonb, ${(i + 1) * 10}, TRUE)
          ON CONFLICT (section, slug) DO NOTHING
        `;
      }
    } else if (section === "faq") {
      let order = 10;
      for (const group of FAQ_GROUPS) {
        for (const item of group.items) {
          const slug = slugifyCms(`${group.category}-${item.q}`, "faq");
          const body = { answer: item.a };
          await sql`
            INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published)
            VALUES ('faq', ${slug}, ${item.q}, ${group.category}, 'published', ${item.a}, ${JSON.stringify(body)}::jsonb, ${order}, TRUE)
            ON CONFLICT (section, slug) DO NOTHING
          `;
          order += 10;
        }
      }
    } else if (section === "roadmap") {
      for (let i = 0; i < ROADMAP_ITEMS.length; i++) {
        const r = ROADMAP_ITEMS[i];
        const body = { target: r.target };
        await sql`
          INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published)
          VALUES ('roadmap', ${r.id}, ${r.title}, ${r.category}, ${r.status}, ${r.description}, ${JSON.stringify(body)}::jsonb, ${(i + 1) * 10}, TRUE)
          ON CONFLICT (section, slug) DO NOTHING
        `;
      }
    } else if (section === "changelog") {
      for (let i = 0; i < CHANGELOG_RELEASES.length; i++) {
        const c = CHANGELOG_RELEASES[i];
        const body = {
          version: c.version,
          date: c.date,
          newItems: c.newItems || [],
          improvedItems: c.improvedItems || [],
          fixedItems: c.fixedItems || [],
        };
        await sql`
          INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published)
          VALUES ('changelog', ${slugifyCms(c.version, "rel")}, ${c.title}, ${c.version}, 'published', ${c.summary}, ${JSON.stringify(body)}::jsonb, ${(i + 1) * 10}, TRUE)
          ON CONFLICT (section, slug) DO NOTHING
        `;
      }
    } else if (section === "page") {
      await sql`
        INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published)
        VALUES ('page', 'about', ${ABOUT_PAGE_DEFAULT.title}, 'Story', 'published', ${ABOUT_PAGE_DEFAULT.lead}, ${JSON.stringify(ABOUT_PAGE_DEFAULT)}::jsonb, 10, TRUE)
        ON CONFLICT (section, slug) DO NOTHING
      `;
      const supportPayload: SupportPageContent = {
        badge: SUPPORT_CHANNELS.badge,
        title: SUPPORT_CHANNELS.title,
        lead: SUPPORT_CHANNELS.lead,
        email: SUPPORT_CHANNELS.email,
        responseWindow: SUPPORT_CHANNELS.responseWindow,
        bugChecklist: SUPPORT_CHANNELS.bugChecklist,
      };
      await sql`
        INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published)
        VALUES ('page', 'support', ${supportPayload.title}, 'Support', 'published', ${supportPayload.lead}, ${JSON.stringify(supportPayload)}::jsonb, 20, TRUE)
        ON CONFLICT (section, slug) DO NOTHING
      `;
    }

    seededSections.add(section);
  } catch (err) {
    console.warn(`seedCmsSectionIfEmpty(${section}) warning:`, err);
  }
}

export async function seedAllCmsDefaults(forceMissing = false): Promise<void> {
  const sections: CmsSection[] = ["blog", "guide", "faq", "roadmap", "changelog", "page"];
  for (const s of sections) {
    await seedCmsSectionIfEmpty(s, forceMissing);
  }
}

function mapBlogRow(row: Record<string, any>): BlogPost {
  const b = (row.body_json || {}) as Record<string, any>;
  const author = String(b.author || "Emmanuel").trim() || "Emmanuel";
  const initials =
    String(b.authorInitials || "").trim() ||
    author
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || "")
      .join("") ||
    "CT";
  const sections = Array.isArray(b.sections) && b.sections.length > 0
    ? b.sections
    : parseMarkdownSections(String(b.markdown || row.summary || ""));
  return {
    slug: String(row.slug),
    title: String(row.title),
    excerpt: String(row.summary || ""),
    date: String(b.date || new Date(row.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
    category: String(row.category || "Engineering"),
    author,
    authorInitials: initials,
    readTime: String(b.readTime || "3 min read"),
    sections,
  };
}

export async function getPublishedBlogPosts(): Promise<BlogPost[]> {
  if (!process.env.DATABASE_URL) return BLOG_POSTS;
  try {
    await seedCmsSectionIfEmpty("blog");
    const sql = getSql();
    const rows = await sql`
      SELECT id, slug, title, category, summary, body_json, sort_order, created_at
      FROM cms_entries
      WHERE section = 'blog' AND published = TRUE
      ORDER BY sort_order ASC, created_at DESC
    `;
    return rows.length > 0 ? rows.map(mapBlogRow) : BLOG_POSTS;
  } catch {
    return BLOG_POSTS;
  }
}

export async function getPublishedBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  if (!process.env.DATABASE_URL) {
    return BLOG_POSTS.find((p) => p.slug === slug) || null;
  }
  try {
    await seedCmsSectionIfEmpty("blog");
    const sql = getSql();
    const rows = await sql`
      SELECT id, slug, title, category, summary, body_json, sort_order, created_at
      FROM cms_entries
      WHERE section = 'blog' AND slug = ${slug} AND published = TRUE
      LIMIT 1
    `;
    if (rows[0]) return mapBlogRow(rows[0]);
    return BLOG_POSTS.find((p) => p.slug === slug) || null;
  } catch {
    return BLOG_POSTS.find((p) => p.slug === slug) || null;
  }
}

export async function getPublishedGuides(): Promise<GuideItem[]> {
  if (!process.env.DATABASE_URL) return GUIDES_LIST;
  try {
    await seedCmsSectionIfEmpty("guide");
    const sql = getSql();
    const rows = await sql`
      SELECT slug, title, category, summary, body_json
      FROM cms_entries
      WHERE section = 'guide' AND published = TRUE
      ORDER BY sort_order ASC, created_at DESC
    `;
    if (!rows.length) return GUIDES_LIST;
    return rows.map((row: Record<string, any>) => {
      const b = (row.body_json || {}) as Record<string, any>;
      return {
        id: String(row.slug),
        category: String(row.category || "Get started"),
        title: String(row.title),
        readTime: String(b.readTime || "2 min"),
        summary: String(row.summary || ""),
        steps: Array.isArray(b.steps) ? b.steps.map(String).filter(Boolean) : [],
        tip: b.tip ? String(b.tip) : undefined,
      };
    });
  } catch {
    return GUIDES_LIST;
  }
}

export async function getPublishedFaqs(): Promise<FaqCategory[]> {
  if (!process.env.DATABASE_URL) return FAQ_GROUPS;
  try {
    await seedCmsSectionIfEmpty("faq");
    const sql = getSql();
    const rows = await sql`
      SELECT title, category, summary, body_json
      FROM cms_entries
      WHERE section = 'faq' AND published = TRUE
      ORDER BY sort_order ASC, created_at ASC
    `;
    if (!rows.length) return FAQ_GROUPS;
    const grouped = new Map<string, { q: string; a: string }[]>();
    for (const row of rows) {
      const cat = String(row.category || "General").trim() || "General";
      const b = (row.body_json || {}) as Record<string, any>;
      const list = grouped.get(cat) || [];
      list.push({ q: String(row.title), a: String(b.answer || row.summary || "") });
      grouped.set(cat, list);
    }
    return Array.from(grouped.entries()).map(([category, items]) => ({ category, items }));
  } catch {
    return FAQ_GROUPS;
  }
}

export async function getPublishedRoadmap(): Promise<RoadmapItem[]> {
  if (!process.env.DATABASE_URL) return ROADMAP_ITEMS;
  try {
    await seedCmsSectionIfEmpty("roadmap");
    const sql = getSql();
    const rows = await sql`
      SELECT slug, title, category, status, summary, body_json
      FROM cms_entries
      WHERE section = 'roadmap' AND published = TRUE
      ORDER BY sort_order ASC, created_at DESC
    `;
    if (!rows.length) return ROADMAP_ITEMS;
    const allowed: RoadmapStatus[] = ["shipped", "in_progress", "planned", "exploring"];
    return rows.map((row: Record<string, any>) => {
      const b = (row.body_json || {}) as Record<string, any>;
      const rawStatus = String(row.status || "planned") as RoadmapStatus;
      return {
        id: String(row.slug),
        title: String(row.title),
        description: String(row.summary || ""),
        status: allowed.includes(rawStatus) ? rawStatus : "planned",
        category: String(row.category || "General"),
        target: String(b.target || "Upcoming"),
      };
    });
  } catch {
    return ROADMAP_ITEMS;
  }
}

export async function getPublishedChangelogs(): Promise<ChangelogRelease[]> {
  if (!process.env.DATABASE_URL) return CHANGELOG_RELEASES;
  try {
    await seedCmsSectionIfEmpty("changelog");
    const sql = getSql();
    const rows = await sql`
      SELECT slug, title, category, summary, body_json
      FROM cms_entries
      WHERE section = 'changelog' AND published = TRUE
      ORDER BY sort_order ASC, created_at DESC
    `;
    if (!rows.length) return CHANGELOG_RELEASES;
    return rows.map((row: Record<string, any>) => {
      const b = (row.body_json || {}) as Record<string, any>;
      return {
        version: String(b.version || row.category || row.slug),
        date: String(b.date || ""),
        title: String(row.title),
        summary: String(row.summary || ""),
        newItems: Array.isArray(b.newItems) ? b.newItems.map(String).filter(Boolean) : [],
        improvedItems: Array.isArray(b.improvedItems) ? b.improvedItems.map(String).filter(Boolean) : [],
        fixedItems: Array.isArray(b.fixedItems) ? b.fixedItems.map(String).filter(Boolean) : [],
      };
    });
  } catch {
    return CHANGELOG_RELEASES;
  }
}

export async function getCmsAboutPage(): Promise<AboutPageContent> {
  if (!process.env.DATABASE_URL) return ABOUT_PAGE_DEFAULT;
  try {
    await seedCmsSectionIfEmpty("page");
    const sql = getSql();
    const rows = await sql`
      SELECT title, summary, body_json
      FROM cms_entries
      WHERE section = 'page' AND slug = 'about'
      LIMIT 1
    `;
    if (!rows[0]) return ABOUT_PAGE_DEFAULT;
    const b = (rows[0].body_json || {}) as Record<string, any>;
    return {
      badge: String(b.badge || ABOUT_PAGE_DEFAULT.badge),
      title: String(rows[0].title || b.title || ABOUT_PAGE_DEFAULT.title),
      lead: String(rows[0].summary || b.lead || ABOUT_PAGE_DEFAULT.lead),
      paragraphs: Array.isArray(b.paragraphs) && b.paragraphs.length > 0 ? b.paragraphs.map(String) : ABOUT_PAGE_DEFAULT.paragraphs,
      signatureName: String(b.signatureName || ABOUT_PAGE_DEFAULT.signatureName),
      signatureRole: String(b.signatureRole || ABOUT_PAGE_DEFAULT.signatureRole),
      contactNote: String(b.contactNote || ABOUT_PAGE_DEFAULT.contactNote),
    };
  } catch {
    return ABOUT_PAGE_DEFAULT;
  }
}

export async function getCmsSupportPage(): Promise<SupportPageContent> {
  const fallback: SupportPageContent = {
    badge: SUPPORT_CHANNELS.badge,
    title: SUPPORT_CHANNELS.title,
    lead: SUPPORT_CHANNELS.lead,
    email: SUPPORT_CHANNELS.email,
    responseWindow: SUPPORT_CHANNELS.responseWindow,
    bugChecklist: SUPPORT_CHANNELS.bugChecklist,
  };
  if (!process.env.DATABASE_URL) return fallback;
  try {
    await seedCmsSectionIfEmpty("page");
    const sql = getSql();
    const rows = await sql`
      SELECT title, summary, body_json
      FROM cms_entries
      WHERE section = 'page' AND slug = 'support'
      LIMIT 1
    `;
    if (!rows[0]) return fallback;
    const b = (rows[0].body_json || {}) as Record<string, any>;
    return {
      badge: String(b.badge || fallback.badge),
      title: String(rows[0].title || b.title || fallback.title),
      lead: String(rows[0].summary || b.lead || fallback.lead),
      email: String(b.email || fallback.email),
      responseWindow: String(b.responseWindow || fallback.responseWindow),
      bugChecklist: Array.isArray(b.bugChecklist) && b.bugChecklist.length > 0 ? b.bugChecklist.map(String) : fallback.bugChecklist,
    };
  } catch {
    return fallback;
  }
}
