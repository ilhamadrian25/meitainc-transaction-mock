import { NextRequest, NextResponse } from "next/server";
import { deleteRule, listSources, loadRules, upsertRule } from "@/lib/store";
import type { MockRule } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/rules — semua rule lengkap dari Supabase (dipakai editor UI). */
export async function GET() {
  try {
    const [{ rules, errors }, files] = await Promise.all([loadRules(), listSources()]);
    return NextResponse.json({ total: rules.length, errors, files, rules });
  } catch (e) {
    return NextResponse.json({ error: "SUPABASE_ERROR", message: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/admin/rules — buat atau timpa satu rule.
 * Body: rule utuh, plus opsional "_file" (tag/source rule baru) dan
 * "_originalId" (id sebelum diubah, supaya rename tidak menyisakan duplikat).
 */
export async function POST(req: NextRequest) {
  type Incoming = MockRule & { _file?: string; _originalId?: string };
  let incoming: Incoming;
  try {
    incoming = (await req.json()) as Incoming;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  if (!incoming?.id || !incoming?.request) {
    return NextResponse.json(
      { error: "INVALID_RULE", message: 'Rule wajib punya "id" dan "request".' },
      { status: 400 },
    );
  }

  const { _file, _originalId, ...rule } = incoming;
  try {
    // Rename: buang rule lama dulu supaya tidak tertinggal sebagai duplikat.
    if (_originalId && _originalId !== rule.id) await deleteRule(_originalId);
    const { file } = await upsertRule(rule as MockRule, _file);
    return NextResponse.json({ ok: true, id: rule.id, file });
  } catch (e) {
    return NextResponse.json({ error: "WRITE_FAILED", message: (e as Error).message }, { status: 500 });
  }
}

/** DELETE /api/admin/rules?id=xxx — hapus rule dari Supabase. */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  try {
    const removed = await deleteRule(id);
    return NextResponse.json({ ok: removed, id }, { status: removed ? 200 : 404 });
  } catch (e) {
    return NextResponse.json({ error: "WRITE_FAILED", message: (e as Error).message }, { status: 500 });
  }
}
