import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

let schemaEnsured = false;

async function ensureReviewColumns(sql: ReturnType<typeof getSql>) {
  if (schemaEnsured) return;
  try {
    await sql`ALTER TABLE school_reviews ALTER COLUMN school_id DROP NOT NULL`;
    await sql`ALTER TABLE school_reviews ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'studio'`;
    schemaEnsured = true;
  } catch (err) {
    console.warn("ensureReviewColumns note:", err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const sql = getSql();
    await ensureReviewColumns(sql);

    const reviews = await sql`
      SELECT
        r.id, r.school_id, r.school_name, r.author_name, r.author_role, r.city_region,
        r.rating, r.headline, r.body, r.app_version, r.status, r.featured,
        COALESCE(r.source, 'studio') AS source,
        r.reviewed_at, r.created_at, r.updated_at,
        u.email AS owner_email
      FROM school_reviews r
      LEFT JOIN users_hq u ON u.id = r.user_id
      ORDER BY
        CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        r.featured DESC,
        r.updated_at DESC
      LIMIT 200
    `;

    const pending = reviews.filter((r: Record<string, any>) => r.status === "pending").length;
    const approved = reviews.filter((r: Record<string, any>) => r.status === "approved").length;
    const rejected = reviews.filter((r: Record<string, any>) => r.status === "rejected").length;
    const approvedRatings = reviews.filter((r: Record<string, any>) => r.status === "approved");
    const avg = approvedRatings.length
      ? Number(
          (
            approvedRatings.reduce((acc: number, r: Record<string, any>) => acc + Number(r.rating || 0), 0) /
            approvedRatings.length
          ).toFixed(1)
        )
      : 0;

    return NextResponse.json({
      ok: true,
      summary: {
        total: reviews.length,
        pending,
        approved,
        rejected,
        average_rating: avg,
      },
      reviews,
    });
  } catch (err) {
    console.error("HQ reviews GET error:", err);
    return NextResponse.json({ ok: false, error: "hq_reviews_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const action = String(body?.action || "").trim();
    const sql = getSql();
    const ip = getClientIp(req);
    await ensureReviewColumns(sql);

    if (action === "create") {
      const schoolName = String(body?.school_name || "").trim().slice(0, 120);
      const authorName = String(body?.author_name || "").trim().slice(0, 80);
      const authorRole = String(body?.author_role || "School Principal").trim().slice(0, 80) || "School Administrator";
      const cityRegion = String(body?.city_region || "").trim().slice(0, 80);
      const headline = String(body?.headline || "").trim().slice(0, 120);
      const reviewBody = String(body?.body || "").trim().slice(0, 800);
      const rating = Math.floor(Number(body?.rating || 5));
      const publishNow = body?.publish_now !== false;
      const featured = Boolean(body?.featured);
      const status = publishNow ? "approved" : "pending";

      if (schoolName.length < 2) {
        return NextResponse.json({ ok: false, message: "Please enter the school or institution name." }, { status: 400 });
      }
      if (authorName.length < 2) {
        return NextResponse.json({ ok: false, message: "Please enter the reviewer's name." }, { status: 400 });
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ ok: false, message: "Star rating must be between 1 and 5." }, { status: 400 });
      }
      if (reviewBody.length < 10) {
        return NextResponse.json({ ok: false, message: "Please enter at least 10 characters for the review." }, { status: 400 });
      }

      const inserted = await sql`
        INSERT INTO school_reviews (
          school_id, user_id, school_name, author_name, author_role, city_region,
          rating, headline, body, app_version, status, featured, source,
          reviewed_by, reviewed_at, created_at, updated_at
        )
        VALUES (
          NULL,
          ${hq.user.id}::uuid,
          ${schoolName},
          ${authorName},
          ${authorRole},
          ${cityRegion},
          ${rating},
          ${headline},
          ${reviewBody},
          NULL,
          ${status},
          ${publishNow ? featured : false},
          'hq_manual',
          ${hq.user.id}::uuid,
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING id, school_name, author_name, author_role, city_region, rating, headline, body, status, featured, source, created_at
      `;

      const row = inserted[0];
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_create_review",
        targetType: "school_review",
        targetId: String(row?.id || ""),
        ipAddress: ip,
        details: { school_name: schoolName, author_name: authorName, rating, status, featured },
      });

      return NextResponse.json({
        ok: true,
        review: row,
        message: publishNow
          ? "Review added and published live on the CogniTara website."
          : "Review saved as pending in HQ.",
      });
    }

    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, message: "Review ID is required." }, { status: 400 });
    }

    if (action === "edit") {
      const schoolName = String(body?.school_name || "").trim().slice(0, 120);
      const authorName = String(body?.author_name || "").trim().slice(0, 80);
      const authorRole = String(body?.author_role || "School Administrator").trim().slice(0, 80) || "School Administrator";
      const cityRegion = String(body?.city_region || "").trim().slice(0, 80);
      const headline = String(body?.headline || "").trim().slice(0, 120);
      const reviewBody = String(body?.body || "").trim().slice(0, 800);
      const rating = Math.floor(Number(body?.rating || 5));

      if (schoolName.length < 2 || authorName.length < 2 || reviewBody.length < 10) {
        return NextResponse.json({ ok: false, message: "School name, reviewer name, and review text are required." }, { status: 400 });
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ ok: false, message: "Star rating must be between 1 and 5." }, { status: 400 });
      }

      await sql`
        UPDATE school_reviews
        SET school_name = ${schoolName},
            author_name = ${authorName},
            author_role = ${authorRole},
            city_region = ${cityRegion},
            rating = ${rating},
            headline = ${headline},
            body = ${reviewBody},
            reviewed_by = ${hq.user.id}::uuid,
            updated_at = NOW()
        WHERE id = ${id}::uuid
      `;

      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_edit_review",
        targetType: "school_review",
        targetId: id,
        ipAddress: ip,
        details: { school_name: schoolName, rating },
      });

      return NextResponse.json({ ok: true, message: "Review updated." });
    }

    if (action === "approve") {
      await sql`
        UPDATE school_reviews
        SET status = 'approved',
            reviewed_by = ${hq.user.id}::uuid,
            reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_approve_review",
        targetType: "school_review",
        targetId: id,
        ipAddress: ip,
        details: { status: "approved" },
      });
      return NextResponse.json({ ok: true, message: "Review approved and published to the website." });
    }

    if (action === "reject") {
      await sql`
        UPDATE school_reviews
        SET status = 'rejected',
            featured = FALSE,
            reviewed_by = ${hq.user.id}::uuid,
            reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${id}::uuid
      `;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_reject_review",
        targetType: "school_review",
        targetId: id,
        ipAddress: ip,
        details: { status: "rejected" },
      });
      return NextResponse.json({ ok: true, message: "Review hidden from the website." });
    }

    if (action === "toggle_featured") {
      const rows = await sql`
        UPDATE school_reviews
        SET featured = NOT featured,
            status = CASE WHEN NOT featured THEN 'approved' ELSE status END,
            reviewed_by = ${hq.user.id}::uuid,
            reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = ${id}::uuid
        RETURNING featured
      `;
      const isFeatured = Boolean(rows[0]?.featured);
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_toggle_featured_review",
        targetType: "school_review",
        targetId: id,
        ipAddress: ip,
        details: { featured: isFeatured },
      });
      return NextResponse.json({ ok: true, message: isFeatured ? "Pinned as featured testimonial." : "Removed from featured testimonials." });
    }

    if (action === "delete") {
      await sql`DELETE FROM school_reviews WHERE id = ${id}::uuid`;
      await logDeveloperAudit({
        actorUserId: hq.user.id,
        actorEmail: hq.user.email,
        action: "hq_delete_review",
        targetType: "school_review",
        targetId: id,
        ipAddress: ip,
        details: {},
      });
      return NextResponse.json({ ok: true, message: "Review deleted permanently." });
    }

    return NextResponse.json({ ok: false, message: "Unknown review action." }, { status: 400 });
  } catch (err) {
    console.error("HQ reviews POST error:", err);
    return NextResponse.json({ ok: false, error: "hq_review_action_failed", message: "Action failed." }, { status: 500 });
  }
}
