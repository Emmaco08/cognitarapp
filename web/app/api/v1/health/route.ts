import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getSql();
    const res = await sql`SELECT 1 AS ok, NOW() AS server_time`;
    return NextResponse.json({
      ok: true,
      service: "cognitara-cloud",
      database: "connected",
      server_utc: Math.floor(Date.now() / 1000),
      server_time: res[0]?.server_time || new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        service: "cognitara-cloud",
        database: "error",
        error: err instanceof Error ? err.message : "db_unavailable",
      },
      { status: 503 }
    );
  }
}
