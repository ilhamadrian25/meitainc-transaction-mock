import { getPath } from "./matcher";
import type { RequestContext } from "./types";

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

function helper(expr: string): { hit: boolean; value: unknown } {
  const [name, ...args] = expr.split(":");
  switch (name) {
    case "uuid":
      return { hit: true, value: globalThis.crypto.randomUUID() };
    case "now":
      return { hit: true, value: new Date().toISOString() };
    case "timestamp":
      return { hit: true, value: Date.now() };
    case "randomInt": {
      const min = Number(args[0] ?? 0);
      const max = Number(args[1] ?? 100);
      return { hit: true, value: Math.floor(Math.random() * (max - min + 1)) + min };
    }
    case "randomFrom": {
      const opts = (args.join(":") || "").split("|").filter(Boolean);
      return { hit: true, value: opts[Math.floor(Math.random() * opts.length)] ?? null };
    }
    default:
      return { hit: false, value: undefined };
  }
}

/** Resolve satu ekspresi: "query.product||FALLBACK" atau helper "uuid". */
function resolve(expr: string, ctx: RequestContext): unknown {
  const [rawPath, fallback] = expr.split("||").map((s) => s.trim());

  const h = helper(rawPath);
  if (h.hit) return h.value;

  let value: unknown;
  if (rawPath === "method") value = ctx.method;
  else if (rawPath === "path") value = ctx.path;
  else if (rawPath.startsWith("query.")) value = ctx.query[rawPath.slice(6)];
  else if (rawPath.startsWith("params.")) value = ctx.params[rawPath.slice(7)];
  else if (rawPath.startsWith("headers.")) value = ctx.headers[rawPath.slice(8).toLowerCase()];
  else if (rawPath.startsWith("body.")) value = getPath(ctx.body, rawPath.slice(5));
  else if (rawPath === "body") value = ctx.body;

  if (value === undefined || value === null) return fallback ?? null;
  return value;
}

/**
 * Interpolasi template di seluruh struktur response.
 * String yang isinya PERSIS satu token ("{{body.items}}") mempertahankan tipe
 * aslinya (object/array/number); selain itu di-render jadi string.
 */
export function render<T>(value: T, ctx: RequestContext): T {
  if (typeof value === "string") {
    const exact = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (exact) return resolve(exact[1], ctx) as T;
    return value.replace(TOKEN, (_, expr: string) => {
      const v = resolve(expr, ctx);
      return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    }) as T;
  }
  if (Array.isArray(value)) return value.map((v) => render(v, ctx)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[render(k, ctx)] = render(v, ctx);
    }
    return out as T;
  }
  return value;
}
