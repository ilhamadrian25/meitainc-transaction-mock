// Migrasi satu kali: baca semua mocks/*.json lama dan upsert ke tabel
// Supabase `mock_rules`. Jalankan dengan:
//   node --env-file=.env.local scripts/seed-supabase.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mocksDir = path.join(__dirname, "..", "mocks");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diisi (lihat .env.local).");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function normalize(p) {
  return ("/" + p).replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

const files = fs.existsSync(mocksDir)
  ? fs.readdirSync(mocksDir).filter((f) => f.endsWith(".json") && f !== "_runtime.json")
  : [];

if (files.length === 0) {
  console.log("Tidak ada file mocks/*.json untuk dimigrasi.");
  process.exit(0);
}

const rows = [];
for (const file of files) {
  const doc = JSON.parse(fs.readFileSync(path.join(mocksDir, file), "utf8"));
  const base = doc.basePath ? normalize(doc.basePath) : "";
  const source = path.basename(file, ".json");

  for (const rule of doc.rules ?? []) {
    if (!rule.id) continue;
    rows.push({
      id: rule.id,
      source,
      description: rule.description ?? null,
      enabled: rule.enabled !== false,
      priority: rule.priority ?? 0,
      request: {
        ...rule.request,
        path: rule.request?.path ? normalize(base + normalize(rule.request.path)) : rule.request?.path,
      },
      response: rule.response ?? {},
      sequence: rule.sequence ?? null,
    });
  }
}

console.log(`Mengirim ${rows.length} rule dari ${files.length} file ke Supabase...`);
const { error } = await supabase.from("mock_rules").upsert(rows);
if (error) {
  console.error("Gagal seeding:", error.message);
  process.exit(1);
}
console.log("Selesai. Rule sudah ada di tabel mock_rules.");
