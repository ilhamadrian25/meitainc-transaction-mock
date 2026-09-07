# meitainc-transaction-mock

Mock API dinamis berbasis Next.js untuk layanan transaksi Payterra. Satu endpoint catch-all
(`/api/mock/*`) melayani semua request, dan response-nya ditentukan oleh **rule** yang dicocokkan
dari **path, query, header, dan body** request. Rule disimpan di tabel `mock_rules` pada
**Supabase (Postgres, free tier)** dan bisa diedit lewat UI di `http://localhost:4000` —
perubahan langsung aktif (cache in-memory maksimal 2 detik, tanpa restart).

## Setup Supabase (sekali saja)

1. Buat project di [supabase.com](https://supabase.com) (free tier cukup).
2. Buka **SQL Editor** di project itu, jalankan isi file `supabase/schema.sql` — ini membuat
   tabel `mock_rules` beserta index dan trigger `updated_at`.
3. Buka **Project Settings → API**, salin **Project URL** dan **service_role key** (bukan
   `anon` key — service_role dipakai supaya server Next.js bisa baca/tulis tanpa policy RLS
   tambahan, dan key ini tidak pernah dikirim ke browser).
4. Isi `.env.local` di root project:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=xxxxxxxx
   ```
5. (Opsional) migrasikan rule contoh yang ada di `mocks/*.json` ke Supabase:
   ```bash
   npm run seed
   ```

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:4000
```

- UI editor rule: `http://localhost:4000`
- Base URL mock: `http://localhost:4000/api/mock`

Untuk mode produksi: `npm run build && npm start`. Env var yang sama (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`) wajib ada di lingkungan deploy juga.

## Contoh cepat

```bash
curl "http://localhost:4000/api/mock/products?product=PLP"    # -> rule products-plp
curl "http://localhost:4000/api/mock/products?product=PLN"    # -> rule products-pln
curl "http://localhost:4000/api/mock/products"                # -> rule products-all
curl "http://localhost:4000/api/mock/products?product=XYZ"    # -> 404 PRODUCT_NOT_FOUND
```

Setiap response membawa header `x-mock-rule` (id rule yang dipakai) dan `x-mock-source`
(file asalnya), jadi mudah tahu rule mana yang match.

## Cara rule dipilih

Semua rule dievaluasi, lalu **yang paling spesifik menang** — bukan yang paling atas di file.
Skor spesifisitas: tiap segment path literal +2, path param +1, tiap kondisi query/body +10,
tiap kondisi header +5, method eksplisit +1, dan `priority` +100 per poin.

Jadi `{"product":"PULSA","operator":"TSEL"}` otomatis menang atas `{"product":"PULSA"}`,
yang menang atas rule `/products` tanpa query. Urutan penulisan tidak berpengaruh.

## Bentuk rule

```jsonc
{
  "id": "products-plp",                 // wajib, unik
  "description": "katalog khusus PLP",
  "enabled": true,                       // false = rule dilewati
  "priority": 0,                         // pemenang paksa kalau perlu
  "request": {
    "method": "GET",                     // "*" | "GET" | ["GET","HEAD"]
    "path": "/products",                 // dukung "/trx/:id" dan "/files/*"
    "query":   { "product": "PLP" },
    "headers": { "x-mock-case": "DECLINED" },
    "body":    { "amount": { "$gt": 1000000 } }   // key boleh dot-path: "customer.msisdn"
  },
  "response": {
    "status": 200,
    "delayMs": 200,                      // simulasi latency
    "headers": { "x-trace-id": "{{uuid}}" },
    "body": { "responseCode": "00", "responseMessage": "SUCCESS" }
  }
}
```

### Operator matcher

Nilai matcher boleh literal (`"PLP"`), `"*"` (field harus ada, isi bebas), array
(`["PLP","PLN"]` = salah satu), atau objek operator:

| Operator | Arti |
| --- | --- |
| `$eq` / `$ne` | sama / tidak sama (perbandingan longgar, string vs angka aman) |
| `$in` / `$nin` | termasuk / tidak termasuk daftar |
| `$regex` | cocok regex, mis. `{"$regex":"^(TELKOMSEL\|TSEL)$"}` |
| `$contains` | substring |
| `$exists` | field ada / tidak |
| `$gt` `$gte` `$lt` `$lte` | perbandingan angka |

### Template di response

Response body/header/text bisa memakai token yang diisi dari request:

| Token | Hasil |
| --- | --- |
| `{{query.product}}` | nilai query param |
| `{{params.id}}` | path param dari `/transactions/:id` |
| `{{headers.authorization}}` | header request |
| `{{body.customer.msisdn}}` | field body (dot-path) |
| `{{method}}` / `{{path}}` | method & path request |
| `{{uuid}}` `{{now}}` `{{timestamp}}` | UUID, ISO time, epoch ms |
| `{{randomInt:1000:9999}}` | angka acak dalam rentang |
| `{{randomFrom:SUCCESS\|PENDING\|FAILED}}` | pilih acak dari daftar |
| `{{query.page\|\|1}}` | nilai default kalau kosong |

String yang isinya **persis satu token** mempertahankan tipe aslinya (angka tetap angka,
objek tetap objek); token di tengah kalimat dirender jadi string.

### Response berurutan (polling)

Pakai `sequence` untuk response yang berganti tiap hit — cocok untuk uji polling status:

```jsonc
{
  "id": "transaction-status-polling",
  "request": { "method": "GET", "path": "/transactions/:id/status" },
  "sequence": [
    { "status": 200, "body": { "status": "PENDING" } },
    { "status": 200, "body": { "status": "PENDING" } },
    { "status": 200, "body": { "status": "SUCCESS" } }
  ]
}
```

Counter-nya berputar dan bisa direset lewat `DELETE /api/admin/logs`.

## Override dari sisi client

Berguna saat QA ingin memaksa skenario tanpa mengubah rule:

| Cara | Efek |
| --- | --- |
| `?_scenario=<ruleId>` atau header `x-mock-scenario` | paksa pakai rule tertentu |
| `?_status=503` | timpa HTTP status |
| `?_delay=5000` | timpa delay (maks 30 detik) |

Ketiga query param ini tidak ikut dicocokkan sebagai kondisi rule.

## Endpoint admin

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/admin/rules` | daftar semua rule dari Supabase |
| `POST /api/admin/rules` | buat/timpa rule (body rule + opsional `_file` sebagai tag, `_originalId` untuk rename) |
| `DELETE /api/admin/rules?id=xxx` | hapus rule dari Supabase |
| `GET /api/admin/logs` | 100 request terakhir + rule yang match (in-memory per proses) |
| `DELETE /api/admin/logs` | bersihkan log dan reset counter `sequence` |

UI di halaman utama memakai endpoint ini: pilih rule di sidebar, ubah **Response body**
(termasuk `responseMessage`), klik **Simpan** — baris di tabel `mock_rules` di-upsert dan
mock langsung memakai versi baru (cache in-memory di-invalidate otomatis). Field "Simpan ke"
di form adalah tag bebas (kolom `source`) untuk mengelompokkan rule di sidebar, bukan nama file.

## Struktur

```
supabase/schema.sql          # DDL tabel mock_rules — jalankan sekali di SQL Editor
mocks/                        # rule contoh, hanya dipakai untuk seed awal (npm run seed)
  products.json
  transactions.json
scripts/seed-supabase.mjs    # migrasi mocks/*.json -> tabel mock_rules
src/lib/
  types.ts                  # bentuk rule
  matcher.ts                # pencocokan path/query/header/body + skor spesifisitas
  template.ts               # interpolasi {{...}}
  supabaseClient.ts         # client server-side (service_role key)
  store.ts                  # baca/tulis rule dari Supabase (cache 2 detik), log
src/app/api/mock/[[...path]]/route.ts   # handler semua method
src/app/api/admin/                       # endpoint pengelola rule
src/app/ui/                              # editor rule
```

Menambah endpoint baru = insert satu baris ke tabel `mock_rules` (paling gampang lewat
tombol **Baru** di UI). Tidak perlu menyentuh kode route atau redeploy.
