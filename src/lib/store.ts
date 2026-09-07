import { getSupabase } from "./supabaseClient";
import { normalize } from "./matcher";
import type { MockRule } from "./types";

interface RuleRow {
  id: string;
  source: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  request: MockRule["request"];
  response: MockRule["response"];
  sequence: MockRule["sequence"] | null;
}

function fromRow(row: RuleRow): MockRule {
  return {
    id: row.id,
    description: row.description ?? undefined,
    enabled: row.enabled,
    priority: row.priority,
    request: { ...row.request, path: row.request?.path ? normalize(row.request.path) : row.request?.path },
    response: row.response ?? {},
    sequence: row.sequence ?? undefined,
    _source: row.source,
  };
}

/** Cache singkat di memori supaya tiap hit ke /api/mock tidak selalu query DB. */
const CACHE_TTL_MS = 2000;
let cache: { at: number; rules: MockRule[]; errors: string[] } | null = null;

/** Baca semua rule dari Supabase (tabel `mock_rules`). */
export async function loadRules(): Promise<{ rules: MockRule[]; errors: string[] }> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;

  const { data, error } = await getSupabase()
    .from("mock_rules")
    .select("id, source, description, enabled, priority, request, response, sequence")
    .order("id", { ascending: true });

  if (error) {
    const result = { rules: cache?.rules ?? [], errors: [`Supabase: ${error.message}`] };
    cache = { ...result, at: Date.now() };
    return result;
  }

  const result = { rules: (data as RuleRow[]).map(fromRow), errors: [] };
  cache = { ...result, at: Date.now() };
  return result;
}

export function invalidate(): void {
  cache = null;
}

/** Cari file/tag asal sebuah rule id (dipakai UI untuk default dropdown). */
export async function findRuleSource(id: string): Promise<string | null> {
  const { rules } = await loadRules();
  return rules.find((r) => r.id === id)?._source ?? null;
}

/** Simpan (insert/update) satu rule. `source` = tag pengelompokan bebas di UI. */
export async function upsertRule(rule: MockRule, source?: string): Promise<{ file: string }> {
  const { _source, ...clean } = rule;
  const finalSource = source || _source || "default";

  const row: RuleRow = {
    id: clean.id,
    source: finalSource,
    description: clean.description ?? null,
    enabled: clean.enabled !== false,
    priority: clean.priority ?? 0,
    request: clean.request,
    response: clean.response ?? {},
    sequence: clean.sequence ?? null,
  };

  const { error } = await getSupabase().from("mock_rules").upsert(row as never);

  if (error) throw new Error(error.message);
  invalidate();
  return { file: finalSource };
}

/** Hapus satu rule. */
export async function deleteRule(id: string): Promise<boolean> {
  const { error, count } = await getSupabase()
    .from("mock_rules")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error(error.message);
  invalidate();
  return (count ?? 0) > 0;
}

/** Daftar tag/source yang sudah dipakai, untuk dropdown "simpan sebagai" di UI. */
export async function listSources(): Promise<string[]> {
  const { rules } = await loadRules();
  const set = new Set(rules.map((r) => r._source ?? "default"));
  set.add("default");
  return [...set].sort();
}

/* ---------- state per-proses: counter sequence + log request ---------- */
/* Ephemeral, tidak perlu tahan restart — kalau nanti mau tetap ada lintas
   restart/instance, ini juga bisa dipindah ke tabel Supabase terpisah. */

const counters = new Map<string, number>();

export function nextSequenceIndex(ruleId: string, length: number): number {
  const current = counters.get(ruleId) ?? 0;
  counters.set(ruleId, current + 1);
  return current % length;
}

export function resetCounters(): void {
  counters.clear();
}

export interface LogEntry {
  at: string;
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  matchedRuleId: string | null;
  status: number;
  durationMs: number;
}

const LOG_LIMIT = 100;
const log: LogEntry[] = [];

export function pushLog(entry: LogEntry): void {
  log.unshift(entry);
  if (log.length > LOG_LIMIT) log.length = LOG_LIMIT;
}

export function readLog(): LogEntry[] {
  return log;
}

export function clearLog(): void {
  log.length = 0;
}
