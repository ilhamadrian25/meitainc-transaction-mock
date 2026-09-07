import { NextRequest, NextResponse } from "next/server";
import { findMatch, normalize } from "@/lib/matcher";
import { render } from "@/lib/template";
import { loadRules, nextSequenceIndex, pushLog } from "@/lib/store";
import type { RequestContext, RuleResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/** Query param yang dipakai mock engine sendiri, bukan bagian dari matching. */
const CONTROL_PARAMS = new Set(["_scenario", "_delay", "_status"]);

async function readBody(req: NextRequest): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) return await req.json();
    if (type.includes("form")) return Object.fromEntries((await req.formData()).entries());
    const text = await req.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return undefined;
  }
}

function buildContext(req: NextRequest, segments: string[], body: unknown): RequestContext {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(req.nextUrl.searchParams.keys())) {
    if (CONTROL_PARAMS.has(key)) continue;
    const all = req.nextUrl.searchParams.getAll(key);
    query[key] = all.length > 1 ? all : all[0];
  }
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

  return {
    method: req.method.toUpperCase(),
    path: normalize("/" + segments.join("/")),
    query,
    headers,
    body,
    params: {},
  };
}

async function handle(req: NextRequest, ctxParams: Promise<{ path?: string[] }>) {
  const started = Date.now();
  const { path: segments = [] } = await ctxParams;
  const body = await readBody(req);
  const ctx = buildContext(req, segments, body);

  const { rules, errors } = await loadRules();

  // Paksa satu rule tertentu: ?_scenario=<ruleId> atau header x-mock-scenario.
  const forcedId = req.nextUrl.searchParams.get("_scenario") ?? req.headers.get("x-mock-scenario");
  const match = forcedId
    ? (() => {
        const rule = rules.find((r) => r.id === forcedId);
        return rule ? { rule, params: {}, score: Infinity } : null;
      })()
    : findMatch(rules, ctx);

  if (!match) {
    const candidates = rules
      .filter((r) => !r.request?.path || r.request.path.split("/")[1] === ctx.path.split("/")[1])
      .map((r) => ({ id: r.id, method: r.request?.method ?? "*", path: r.request?.path ?? "*", query: r.request?.query }));

    const payload = {
      error: "NO_MOCK_MATCHED",
      message: forcedId
        ? `Rule dengan id "${forcedId}" tidak ditemukan.`
        : `Tidak ada rule yang cocok untuk ${ctx.method} ${ctx.path}.`,
      request: { method: ctx.method, path: ctx.path, query: ctx.query },
      hint: "Tambahkan rule di folder mocks/ atau POST ke /api/admin/rules.",
      candidates,
      ruleErrors: errors,
    };
    pushLog({ at: new Date().toISOString(), method: ctx.method, path: ctx.path, query: ctx.query, matchedRuleId: null, status: 404, durationMs: Date.now() - started });
    return NextResponse.json(payload, { status: 404, headers: { ...CORS, "x-mock-matched": "none" } });
  }

  ctx.params = match.params;

  const { rule } = match;
  const spec: RuleResponse =
    rule.sequence && rule.sequence.length > 0
      ? rule.sequence[nextSequenceIndex(rule.id, rule.sequence.length)]
      : rule.response ?? {};

  const overrideDelay = req.nextUrl.searchParams.get("_delay");
  const delay = Number(overrideDelay ?? spec.delayMs ?? 0);
  if (delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 30_000)));

  const overrideStatus = req.nextUrl.searchParams.get("_status");
  const status = Number(overrideStatus ?? spec.status ?? 200);

  const headers: Record<string, string> = {
    ...CORS,
    ...render(spec.headers ?? {}, ctx),
    "x-mock-rule": rule.id,
    "x-mock-source": rule._source ?? "runtime",
  };

  pushLog({ at: new Date().toISOString(), method: ctx.method, path: ctx.path, query: ctx.query, matchedRuleId: rule.id, status, durationMs: Date.now() - started });

  if (req.method === "HEAD") return new NextResponse(null, { status, headers });

  if (typeof spec.text === "string") {
    return new NextResponse(render(spec.text, ctx), {
      status,
      headers: { "content-type": "text/plain; charset=utf-8", ...headers },
    });
  }

  if (spec.body === undefined) return new NextResponse(null, { status, headers });

  return NextResponse.json(render(spec.body, ctx), { status, headers });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export const GET = (req: NextRequest, ctx: Ctx) => handle(req, ctx.params);
export const POST = (req: NextRequest, ctx: Ctx) => handle(req, ctx.params);
export const PUT = (req: NextRequest, ctx: Ctx) => handle(req, ctx.params);
export const PATCH = (req: NextRequest, ctx: Ctx) => handle(req, ctx.params);
export const DELETE = (req: NextRequest, ctx: Ctx) => handle(req, ctx.params);
export const HEAD = (req: NextRequest, ctx: Ctx) => handle(req, ctx.params);
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });
