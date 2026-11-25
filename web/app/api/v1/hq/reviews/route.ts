import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { requireHqAdmin } from "@/lib/auth";
import { logDeveloperAudit } from "@/lib/platform";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const hq = await requireHqAdmin(req);
    if (!hq) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "HQ admin access required." }, { status: 403 });
    }

    const sql = getSql();
    const reviews = await sql`
      SELECT
        r.id, r.school_id, r.school_name, r.author_name, r.author_role, r.city_region,
        r.rating, r.headline, r.body, r.app_version, r.status, r.featured,
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
      ? Number((approvedRatings.reduce((acc: number, r: Record<string, any>) => acc + Number(r.rating || 0), 0) / approvedRatings.length).toFixed(1))
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
    const id = String(body?.id || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, message: "Review ID is required." }, { status: 400 });
    }

    const sql = getSql();
    const ip = getClientIp(req);

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
