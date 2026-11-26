import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { resolveLatestWindowsInstaller } from "@/lib/releases";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const leadId = (req.nextUrl.searchParams.get("lead") || "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);

  const [{ url }] = await Promise.all([
    resolveLatestWindowsInstaller(),
    isUuid
      ? (async () => {
          try {
            const sql = getSql();
            await sql`
              UPDATE download_leads
              SET clicked_at = COALESCE(clicked_at, NOW()),
                  download_count = download_count + 1,
                  updated_at = NOW()
              WHERE id = ${leadId}::uuid
            `;
          } catch (err) {
            console.error("Lead click track error:", err);
          }
        })()
      : Promise.resolve(),
  ]);

  return NextResponse.redirect(url, { status: 302 });
}
