import { NextResponse } from "next/server";
import { clearLog, readLog, resetCounters } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/logs — 100 request terakhir beserta rule yang match. */
export function GET() {
  return NextResponse.json({ entries: readLog() });
}

/** DELETE /api/admin/logs — bersihkan log sekaligus reset counter sequence. */
export function DELETE() {
  clearLog();
  resetCounters();
  return NextResponse.json({ ok: true });
}
