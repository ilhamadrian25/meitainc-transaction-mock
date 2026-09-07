import type { MockRule, RequestContext, ValueMatcher } from "./types";

/** Ambil nilai lewat dot-path: "customer.msisdn", "items.0.sku". */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    if (typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function loose(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/** Cocokkan satu nilai aktual dengan matcher dari rule. */
export function matchValue(actual: unknown, matcher: ValueMatcher): boolean {
  // Array literal = salah satu nilai boleh cocok.
  if (Array.isArray(matcher)) return matcher.some((m) => matchValue(actual, m));

  if (matcher !== null && typeof matcher === "object") {
    const m = matcher as Record<string, unknown>;
    const checks: Array<boolean> = [];
    if ("$exists" in m) checks.push((actual !== undefined) === Boolean(m.$exists));
    if ("$eq" in m) checks.push(loose(actual, m.$eq));
    if ("$ne" in m) checks.push(!loose(actual, m.$ne));
    if ("$in" in m) checks.push((m.$in as unknown[]).some((v) => loose(actual, v)));
    if ("$nin" in m) checks.push(!(m.$nin as unknown[]).some((v) => loose(actual, v)));
    if ("$regex" in m) checks.push(new RegExp(String(m.$regex)).test(String(actual ?? "")));
    if ("$contains" in m) checks.push(String(actual ?? "").includes(String(m.$contains)));
    if ("$gt" in m) checks.push(Number(actual) > Number(m.$gt));
    if ("$gte" in m) checks.push(Number(actual) >= Number(m.$gte));
    if ("$lt" in m) checks.push(Number(actual) < Number(m.$lt));
    if ("$lte" in m) checks.push(Number(actual) <= Number(m.$lte));
    return checks.length > 0 && checks.every(Boolean);
  }

  // "*" = field harus ada, nilainya bebas.
  if (matcher === "*") return actual !== undefined && actual !== null;

  // Query string selalu string, jadi bandingkan longgar.
  if (Array.isArray(actual)) return actual.some((v) => loose(v, matcher));
  return loose(actual, matcher);
}

export interface PathMatch {
  params: Record<string, string>;
  /** Jumlah segment literal — dipakai untuk skor spesifisitas. */
  score: number;
}

/** Cocokkan path rule (":param" / "*") dengan path request. */
export function matchPath(pattern: string | undefined, actual: string): PathMatch | null {
  if (!pattern || pattern === "*") return { params: {}, score: 0 };

  const pat = normalize(pattern).split("/").filter(Boolean);
  const act = normalize(actual).split("/").filter(Boolean);
  const params: Record<string, string> = {};
  let score = 0;

  for (let i = 0; i < pat.length; i++) {
    const p = pat[i];
    if (p === "*") return { params, score }; // wildcard menyerap sisa segment
    const a = act[i];
    if (a === undefined) return null;
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(a);
      score += 1;
      continue;
    }
    if (p.toLowerCase() !== a.toLowerCase()) return null;
    score += 2; // segment literal lebih spesifik daripada named param
  }

  if (act.length !== pat.length) return null;
  return { params, score };
}

export function normalize(p: string): string {
  return ("/" + p).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

export interface MatchResult {
  rule: MockRule;
  params: Record<string, string>;
  score: number;
}

/**
 * Pilih rule paling spesifik.
 * Skor = segment path + jumlah kondisi query/header/body + priority*100.
 * Rule yang lebih detail selalu menang atas rule umum, tanpa peduli urutan file.
 */
export function findMatch(rules: MockRule[], ctx: RequestContext): MatchResult | null {
  let best: MatchResult | null = null;

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    const req = rule.request ?? {};

    const methods = req.method
      ? (Array.isArray(req.method) ? req.method : [req.method]).map((m) => m.toUpperCase())
      : ["*"];
    if (!methods.includes("*") && !methods.includes(ctx.method)) continue;

    const pathMatch = matchPath(req.path, ctx.path);
    if (!pathMatch) continue;

    let score = pathMatch.score + (rule.priority ?? 0) * 100;
    if (!methods.includes("*")) score += 1;

    let ok = true;
    for (const [key, matcher] of Object.entries(req.query ?? {})) {
      if (!matchValue(ctx.query[key], matcher)) { ok = false; break; }
      score += 10;
    }
    if (!ok) continue;

    for (const [key, matcher] of Object.entries(req.headers ?? {})) {
      if (!matchValue(ctx.headers[key.toLowerCase()], matcher)) { ok = false; break; }
      score += 5;
    }
    if (!ok) continue;

    for (const [key, matcher] of Object.entries(req.body ?? {})) {
      if (!matchValue(getPath(ctx.body, key), matcher)) { ok = false; break; }
      score += 10;
    }
    if (!ok) continue;

    if (!best || score > best.score) {
      best = { rule, params: pathMatch.params, score };
    }
  }

  return best;
}
