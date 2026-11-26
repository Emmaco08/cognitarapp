import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isValidEmail, normalizeEmail } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/platform";
import { sendDownloadLinkEmail } from "@/lib/brevo";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveLatestWindowsInstaller } from "@/lib/releases";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`dl-lead:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: `Please wait ${rl.retryAfterSec}s before requesting another link.` },
        { status: 429 }
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json", message: "Invalid JSON body." }, { status: 400 });
    }

    const email = normalizeEmail(String(body.email || ""));
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, error: "invalid_email", message: "Enter a valid email address so we can send your download link." },
        { status: 400 }
      );
    }

    const source = String(body.source || "download_page").trim().slice(0, 64) || "download_page";
    const userAgent = (req.headers.get("user-agent") || "").slice(0, 300);

    const [settings, release] = await Promise.all([
      getPlatformSettings(),
      resolveLatestWindowsInstaller(),
    ]);

    const sql = getSql();
    const existing = await sql`
      SELECT id FROM download_leads WHERE LOWER(email) = ${email} LIMIT 1
    `;

    let leadId: string;
    if (existing.length > 0) {
      leadId = String(existing[0].id);
      await sql`
        UPDATE download_leads
        SET source = ${source},
            app_version = ${release.version},
            ip_address = ${ip},
            user_agent = ${userAgent},
            updated_at = NOW()
        WHERE id = ${leadId}::uuid
      `;
    } else {
      const inserted = await sql`
        INSERT INTO download_leads (email, source, app_version, ip_address, user_agent)
        VALUES (${email}, ${source}, ${release.version}, ${ip}, ${userAgent})
        RETURNING id
      `;
      leadId = String(inserted[0].id);
    }

    const origin = req.nextUrl.origin || "https://cognitara-cloud.vercel.app";
    const trackedDownloadUrl = `${origin}/api/v1/download/windows?source=download_link_email&lead=${encodeURIComponent(leadId)}`;

    const emailRes = await sendDownloadLinkEmail({
      settings,
      toEmail: email,
      downloadUrl: trackedDownloadUrl,
      siteUrl: origin,
      versionLabel: release.version,
      trialDays: settings.allow_trial_activation ? settings.free_trial_days : null,
    });

    if (emailRes.ok) {
      await sql`UPDATE download_leads SET email_sent = TRUE, updated_at = NOW() WHERE id = ${leadId}::uuid`;
    }

    return NextResponse.json({
      ok: true,
      email,
      email_sent: emailRes.ok,
      latest_version: release.version,
      download_url: trackedDownloadUrl,
      message: emailRes.ok
        ? `We sent the Windows download link to ${email}. Check your inbox (or download directly below).`
        : `Your email (${email}) has been saved for update alerts. You can download the Windows installer directly below.`,
    });
  } catch (err) {
    console.error("POST /api/v1/download/request error:", err);
    return NextResponse.json(
      { ok: false, error: "download_request_failed", message: "Could not process your request right now. Please try again." },
      { status: 500 }
    );
  }
}
