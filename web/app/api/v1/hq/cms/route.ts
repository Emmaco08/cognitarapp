import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";
import {
  ensureCmsTable,
  parseMarkdownSections,
  seedAllCmsDefaults,
  slugifyCms,
  type CmsSection,
} from "@/lib/cms";

export const dynamic = "force-dynamic";

const ALLOWED_SECTIONS: CmsSection[] = ["blog", "guide", "faq", "roadmap", "changelog", "page"];
const ALLOWED_ROADMAP_STATUS = new Set(["shipped", "in_progress", "planned", "exploring"]);

function splitLines(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || "").trim()).filter(Boolean);
  }
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s+/, "").trim())
    .filter(Boolean);
}

function splitParagraphs(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || "").trim()).filter(Boolean);
  }
  return String(raw || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function buildBodyJson(section: CmsSection, body: Record<string, unknown>, existing: Record<string, any> = {}): Record<string, any> {
  if (section === "blog") {
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    const sections = markdown.trim()
      ? parseMarkdownSections(markdown)
      : Array.isArray(body.sections)
        ? body.sections
        : existing.sections || [];
    const author = String(body.author || existing.author || "Emmanuel").trim().slice(0, 80) || "Emmanuel";
    const authorInitials =
      String(body.author_initials || existing.authorInitials || "")
        .trim()
        .slice(0, 3)
        .toUpperCase() ||
      author
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || "")
        .join("") ||
      "EM";
    return {
      date:
        String(body.date || existing.date || "").trim().slice(0, 40) ||
        new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      author,
      authorInitials,
      readTime: String(body.read_time || existing.readTime || "3 min read").trim().slice(0, 30) || "3 min read",
      sections,
    };
  }

  if (section === "guide") {
    return {
      readTime: String(body.read_time || existing.readTime || "3 min").trim().slice(0, 30) || "3 min",
      steps: splitLines(body.steps !== undefined ? body.steps : existing.steps || []),
      tip: String(body.tip !== undefined ? body.tip : existing.tip || "").trim().slice(0, 500),
    };
  }

  if (section === "faq") {
    return {
      answer: String(body.answer !== undefined ? body.answer : body.summary || existing.answer || "").trim().slice(0, 2000),
    };
  }

  if (section === "roadmap") {
    return {
      target: String(body.target !== undefined ? body.target : existing.target || "v2.4").trim().slice(0, 40) || "v2.4",
    };
  }

  if (section === "changelog") {
    return {
      version: String(body.version || body.category || existing.version || "v2.3.6").trim().slice(0, 32),
      date:
        String(body.date || existing.date || "").trim().slice(0, 40) ||
        new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      newItems: splitLines(body.new_items !== undefined ? body.new_items : existing.newItems || []),
      improvedItems: splitLines(body.improved_items !== undefined ? body.improved_items : existing.improvedItems || []),
      fixedItems: splitLines(body.fixed_items !== undefined ? body.fixed_items : existing.fixedItems || []),
    };
  }

  return existing;
}

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    await ensureCmsTable();
    await seedAllCmsDefaults(false);

    const sql = getSql();
    const rows = await sql`
      SELECT id, section, slug, title, category, status, summary, body_json, sort_order, published, created_at, updated_at
      FROM cms_entries
      ORDER BY section ASC, sort_order ASC, created_at DESC
    `;

    const counts: Record<string, number> = {
      blog: 0,
      guide: 0,
      faq: 0,
      roadmap: 0,
      changelog: 0,
      page: 0,
    };
    for (const r of rows) {
      const sec = String(r.section || "");
      counts[sec] = (counts[sec] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      counts,
      entries: rows,
    });
  } catch (err) {
    console.error("HQ CMS GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_cms_load_failed", message: "Failed to load CMS entries." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    await ensureCmsTable();
    const sql = getSql();
    const ip = getClientIp(req);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(body?.action || "").trim();

    if (action === "seed_defaults") {
      await seedAllCmsDefaults(true);
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_cms_seed_defaults",
        targetType: "cms_entries",
        targetId: "all",
        ipAddress: ip,
        details: {},
      });
      return NextResponse.json({ ok: true, message: "Default website content restored for any missing items." });
    }

    if (action === "save_page") {
      const slug = String(body?.slug || "").trim().toLowerCase();
      if (slug !== "about" && slug !== "support") {
        return NextResponse.json({ ok: false, message: "Page slug must be 'about' or 'support'." }, { status: 400 });
      }

      const title = String(body?.title || "").trim().slice(0, 160);
      const lead = String(body?.lead || "").trim().slice(0, 500);
      if (title.length < 2) {
        return NextResponse.json({ ok: false, message: "Page title is required." }, { status: 400 });
      }

      let payload: Record<string, unknown>;
      if (slug === "about") {
        payload = {
          badge: String(body?.badge || "Story").trim().slice(0, 40) || "Story",
          title,
          lead,
          paragraphs: splitParagraphs(body?.paragraphs),
          signatureName: String(body?.signature_name || "Emmanuel").trim().slice(0, 80) || "Emmanuel",
          signatureRole: String(body?.signature_role || "Founder & Lead Engineer").trim().slice(0, 100),
          contactNote: String(body?.contact_note || "").trim().slice(0, 300),
        };
      } else {
        payload = {
          badge: String(body?.badge || "Get support").trim().slice(0, 40) || "Get support",
          title,
          lead,
          email: String(body?.email || "support@cognitara.net").trim().slice(0, 120) || "support@cognitara.net",
          responseWindow: String(body?.response_window || "").trim().slice(0, 260),
          bugChecklist: splitLines(body?.bug_checklist),
        };
      }

      await sql`
        INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published, updated_at)
        VALUES ('page', ${slug}, ${title}, ${slug === "about" ? "Story" : "Support"}, 'published', ${lead}, ${JSON.stringify(payload)}::jsonb, ${slug === "about" ? 10 : 20}, TRUE, NOW())
        ON CONFLICT (section, slug)
        DO UPDATE SET
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          body_json = EXCLUDED.body_json,
          updated_at = NOW()
      `;

      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_cms_save_page",
        targetType: "cms_page",
        targetId: slug,
        ipAddress: ip,
        details: { title },
      });

      return NextResponse.json({
        ok: true,
        message: slug === "about" ? "Story (/about) page saved live." : "Support (/support) page saved live.",
      });
    }

    if (action === "create") {
      const section = String(body?.section || "").trim() as CmsSection;
      if (!ALLOWED_SECTIONS.includes(section) || section === "page") {
        return NextResponse.json({ ok: false, message: "Invalid CMS section." }, { status: 400 });
      }

      const title = String(body?.title || "").trim().slice(0, 220);
      if (title.length < 2) {
        return NextResponse.json({ ok: false, message: "Please enter a title." }, { status: 400 });
      }

      const rawSlug = String(body?.slug || "").trim();
      let slug = slugifyCms(rawSlug || (section === "changelog" ? String(body?.version || title) : title), section);
      const dup = await sql`SELECT 1 FROM cms_entries WHERE section = ${section} AND slug = ${slug} LIMIT 1`;
      if (dup.length > 0) {
        slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      }

      const category = String(
        section === "changelog" ? body?.version || body?.category || "v2.4.0" : body?.category || ""
      )
        .trim()
        .slice(0, 80);

      let status = String(body?.status || "published").trim();
      if (section === "roadmap") {
        status = ALLOWED_ROADMAP_STATUS.has(status) ? status : "planned";
      } else {
        status = body?.published === false ? "draft" : "published";
      }

      const summary = String(section === "faq" ? body?.answer || body?.summary || "" : body?.summary || "")
        .trim()
        .slice(0, 2000);
      const published = body?.published !== false;
      const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Math.floor(Number(body?.sort_order)) : 50;
      const bodyJson = buildBodyJson(section, body || {});

      const inserted = await sql`
        INSERT INTO cms_entries (section, slug, title, category, status, summary, body_json, sort_order, published, created_at, updated_at)
        VALUES (${section}, ${slug}, ${title}, ${category}, ${status}, ${summary}, ${JSON.stringify(bodyJson)}::jsonb, ${sortOrder}, ${published}, NOW(), NOW())
        RETURNING id, section, slug, title, category, status, summary, body_json, sort_order, published, created_at, updated_at
      `;

      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_cms_create",
        targetType: `cms_${section}`,
        targetId: String(inserted[0]?.id || slug),
        ipAddress: ip,
        details: { section, slug, title, published },
      });

      return NextResponse.json({
        ok: true,
        entry: inserted[0],
        message: published ? "Published live to the CogniTara website." : "Saved as draft in HQ CMS.",
      });
    }

    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, message: "Entry ID is required." }, { status: 400 });
    }

    if (action === "update") {
      const existingRows = await sql`SELECT * FROM cms_entries WHERE id = ${id}::uuid LIMIT 1`;
      const existing = existingRows[0];
      if (!existing) {
        return NextResponse.json({ ok: false, message: "CMS item not found." }, { status: 404 });
      }

      const section = String(existing.section) as CmsSection;
      const title = String(body?.title ?? existing.title).trim().slice(0, 220);
      if (title.length < 2) {
        return NextResponse.json({ ok: false, message: "Title cannot be empty." }, { status: 400 });
      }

      const nextSlug = body?.slug ? slugifyCms(String(body.slug), section) : String(existing.slug);
      const category = String(
        section === "changelog"
          ? body?.version ?? body?.category ?? existing.category
          : body?.category ?? existing.category
      )
        .trim()
        .slice(0, 80);

      let status = String(body?.status ?? existing.status).trim();
      if (section === "roadmap" && !ALLOWED_ROADMAP_STATUS.has(status)) {
        status = String(existing.status || "planned");
      }

      const summary = String(
        section === "faq"
          ? body?.answer ?? body?.summary ?? existing.summary
          : body?.summary ?? existing.summary
      )
        .trim()
        .slice(0, 2000);
      const published = body?.published !== undefined ? Boolean(body.published) : Boolean(existing.published);
      const sortOrder = body?.sort_order !== undefined && Number.isFinite(Number(body.sort_order))
        ? Math.floor(Number(body.sort_order))
        : Number(existing.sort_order || 100);
      const bodyJson = buildBodyJson(section, body || {}, (existing.body_json || {}) as Record<string, any>);

      await sql`
        UPDATE cms_entries
        SET slug = ${nextSlug},
            title = ${title},
            category = ${category},
            status = ${status},
            summary = ${summary},
            body_json = ${JSON.stringify(bodyJson)}::jsonb,
            sort_order = ${sortOrder},
            published = ${published},
            updated_at = NOW()
        WHERE id = ${id}::uuid
      `;

      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_cms_update",
        targetType: `cms_${section}`,
        targetId: id,
        ipAddress: ip,
        details: { section, slug: nextSlug, title, published },
      });

      return NextResponse.json({ ok: true, message: "Changes saved live." });
    }

    if (action === "toggle_published") {
      const updated = await sql`
        UPDATE cms_entries
        SET published = NOT published,
            updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING section, slug, published
      `;
      if (!updated[0]) {
        return NextResponse.json({ ok: false, message: "Entry not found." }, { status: 404 });
      }
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_cms_toggle_published",
        targetType: `cms_${updated[0].section}`,
        targetId: id,
        ipAddress: ip,
        details: { published: updated[0].published },
      });
      return NextResponse.json({
        ok: true,
        published: Boolean(updated[0].published),
        message: updated[0].published ? "Item is now visible on the website." : "Item moved to draft (hidden from website).",
      });
    }

    if (action === "delete") {
      const removed = await sql`DELETE FROM cms_entries WHERE id = ${id}::uuid RETURNING section, slug, title`;
      if (!removed[0]) {
        return NextResponse.json({ ok: false, message: "Entry not found." }, { status: 404 });
      }
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_cms_delete",
        targetType: `cms_${removed[0].section}`,
        targetId: id,
        ipAddress: ip,
        details: { slug: removed[0].slug, title: removed[0].title },
      });
      return NextResponse.json({ ok: true, message: "Deleted permanently." });
    }

    return NextResponse.json({ ok: false, message: "Unknown CMS action." }, { status: 400 });
  } catch (err) {
    console.error("HQ CMS POST error:", err);
    return NextResponse.json({ ok: false, error: "hq_cms_action_failed", message: "CMS save failed." }, { status: 500 });
  }
}
