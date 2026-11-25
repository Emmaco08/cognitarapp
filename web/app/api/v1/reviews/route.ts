import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractBearerOrCookieToken, resolveAuthenticatedAccount } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sql = getSql();
    const mine = req.nextUrl.searchParams.get("mine") === "1";

    if (mine) {
      const token = extractBearerOrCookieToken(req);
      if (!token) {
        return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in required." }, { status: 401 });
      }
      const account = await resolveAuthenticatedAccount(token);
      if (!account || !account.school) {
        return NextResponse.json({ ok: false, error: "unauthorized", message: "School account required." }, { status: 401 });
      }
      const rows = await sql`
        SELECT id, school_name, author_name, author_role, city_region, rating, headline, body, status, featured, created_at, updated_at
        FROM school_reviews
        WHERE school_id = ${account.school.id}::uuid
        LIMIT 1
      `;
      return NextResponse.json({
        ok: true,
        review: rows[0] || null,
      });
    }

    const [reviews, statsRows] = await Promise.all([
      sql`
        SELECT id, school_name, author_name, author_role, city_region, rating, headline, body, featured, created_at
        FROM school_reviews
        WHERE status = 'approved'
        ORDER BY featured DESC, rating DESC, created_at DESC
        LIMIT 24
      `,
      sql`
        SELECT
          COUNT(*)::int AS approved_count,
          COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average_rating
        FROM school_reviews
        WHERE status = 'approved'
      `,
    ]);

    return NextResponse.json({
      ok: true,
      stats: {
        approved_count: statsRows[0]?.approved_count || 0,
        average_rating: Number(statsRows[0]?.average_rating || 0),
      },
      reviews,
    });
  } catch (err) {
    console.error("Reviews GET error:", err);
    return NextResponse.json({ ok: false, error: "reviews_fetch_failed", reviews: [], stats: { approved_count: 0, average_rating: 0 } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`review-post:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Please wait ${rl.retryAfterSec}s before updating your rating.` },
        { status: 429 }
      );
    }

    const token = extractBearerOrCookieToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in with your CogniTara Cloud account first." }, { status: 401 });
    }
    const account = await resolveAuthenticatedAccount(token);
    if (!account || !account.school) {
      return NextResponse.json({ ok: false, error: "unauthorized", message: "School account required to submit a review." }, { status: 401 });
    }
    if (account.school.status !== "active") {
      return NextResponse.json({ ok: false, error: "school_suspended", message: "School account is currently inactive." }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 });
    }

    const rating = Math.floor(Number(body.rating || 0));
    const reviewBody = String(body.body || "").trim().slice(0, 600);
    const headline = String(body.headline || "").trim().slice(0, 100);
    const authorName = String(body.author_name || account.user.full_name || "School Administrator").trim().slice(0, 80);
    const authorRole = String(body.author_role || "School Administrator").trim().slice(0, 80);
    const cityRegion = String(body.city_region || "").trim().slice(0, 80);
    const appVersion = String(body.app_version || "2.2.4").trim().slice(0, 32);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, message: "Please select a star rating from 1 to 5." }, { status: 400 });
    }
    if (reviewBody.length < 12) {
      return NextResponse.json({ ok: false, message: "Please write at least 12 characters about your experience." }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      INSERT INTO school_reviews (
        school_id, user_id, school_name, author_name, author_role, city_region,
        rating, headline, body, app_version, status, updated_at
      )
      VALUES (
        ${account.school.id}::uuid,
        ${account.user.id}::uuid,
        ${account.school.school_name},
        ${authorName},
        ${authorRole},
        ${cityRegion},
        ${rating},
        ${headline},
        ${reviewBody},
        ${appVersion},
        'pending',
        NOW()
      )
      ON CONFLICT (school_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        school_name = EXCLUDED.school_name,
        author_name = EXCLUDED.author_name,
        author_role = EXCLUDED.author_role,
        city_region = EXCLUDED.city_region,
        rating = EXCLUDED.rating,
        headline = EXCLUDED.headline,
        body = EXCLUDED.body,
        app_version = EXCLUDED.app_version,
        status = 'pending',
        updated_at = NOW()
      RETURNING id, school_name, author_name, author_role, city_region, rating, headline, body, status, created_at, updated_at
    `;

    return NextResponse.json({
      ok: true,
      message: "Thank you! Your rating has been sent to CogniTara HQ for approval before appearing on our website.",
      review: rows[0],
    });
  } catch (err) {
    console.error("Reviews POST error:", err);
    return NextResponse.json({ ok: false, error: "review_submit_failed", message: "Could not save your rating right now." }, { status: 500 });
  }
}
