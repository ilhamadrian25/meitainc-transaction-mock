"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { JsonField } from "./JsonField";
import type { MockRule } from "@/lib/types";

const EMPTY_RULE: MockRule = {
  id: "",
  description: "",
  enabled: true,
  priority: 0,
  request: { method: "GET", path: "/" },
  response: { status: 200, body: { responseCode: "00", responseMessage: "SUCCESS", data: {} } },
};

const METHODS = ["*", "GET", "POST", "PUT", "PATCH", "DELETE"];

export function Dashboard() {
  const [rules, setRules] = useState<MockRule[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MockRule | null>(null);
  const [targetFile, setTargetFile] = useState("_runtime.json");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/rules", { cache: "no-store" });
    const data = await res.json();
    setRules(data.rules ?? []);
    setFiles(data.files ?? []);
    setErrors(data.errors ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const select = (rule: MockRule) => {
    setSelectedId(rule.id);
    setDraft(structuredClone(rule));
    setTargetFile(rule._source ?? "_runtime.json");
    setStatus(null);
  };

  const createNew = () => {
    setSelectedId(null);
    setDraft(structuredClone(EMPTY_RULE));
    setTargetFile("_runtime.json");
    setStatus(null);
  };

  const patch = (partial: Partial<MockRule>) => setDraft((d) => (d ? { ...d, ...partial } : d));
  const patchRequest = (partial: Partial<MockRule["request"]>) =>
    setDraft((d) => (d ? { ...d, request: { ...d.request, ...partial } } : d));
  const patchResponse = (partial: Partial<NonNullable<MockRule["response"]>>) =>
    setDraft((d) => (d ? { ...d, response: { ...(d.response ?? {}), ...partial } } : d));

  const save = async () => {
    if (!draft) return;
    if (!draft.id.trim()) {
      setStatus("Rule id wajib diisi.");
      return;
    }
    setStatus("Menyimpan...");
    const res = await fetch("/api/admin/rules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draft, _file: targetFile, _originalId: selectedId ?? undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus("Gagal: " + (data.message ?? data.error));
      return;
    }
    setStatus("Tersimpan ke mocks/" + data.file);
    setSelectedId(draft.id);
    await refresh();
  };

  const remove = async () => {
    if (!draft || !selectedId) return;
    if (!confirm('Hapus rule "' + selectedId + '"?')) return;
    await fetch("/api/admin/rules?id=" + encodeURIComponent(selectedId), { method: "DELETE" });
    setDraft(null);
    setSelectedId(null);
    await refresh();
  };

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const visible = rules.filter(
      (r) =>
        !q ||
        r.id.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.request?.path ?? "").toLowerCase().includes(q),
    );
    const map = new Map<string, MockRule[]>();
    for (const r of visible) {
      const key = r._source ?? "runtime";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rules, filter]);

  return (
    <div className="grid">
      <aside className="card sidebar">
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Cari rule..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button onClick={createNew}>Baru</button>
        </div>

        {errors.length > 0 && (
          <p className="error" style={{ fontSize: 12 }}>
            {errors.length} file bermasalah: {errors.join("; ")}
          </p>
        )}

        {grouped.map(([file, list]) => (
          <div key={file} style={{ marginBottom: 14 }}>
            <div className="file-label">{file}</div>
            {list.map((rule) => (
              <button
                key={rule.id}
                onClick={() => select(rule)}
                className={"rule-item" + (rule.id === selectedId ? " is-active" : "")}
                style={{ opacity: rule.enabled === false ? 0.45 : 1 }}
              >
                <span className="method">{formatMethod(rule)}</span>{" "}
                <span style={{ fontSize: 12 }}>{rule.request?.path ?? "*"}</span>
                <div className="muted" style={{ fontSize: 11 }}>{rule.id}</div>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <section>
        {!draft && (
          <p>
            Pilih rule di kiri untuk mengedit response message-nya, atau klik <strong>Baru</strong>.
          </p>
        )}

        {draft && (
          <div className="card">
            <div className="row" style={{ marginBottom: 12 }}>
              <label style={{ flex: "1 1 200px" }}>
                <span className="field-label">Rule ID</span>
                <input value={draft.id} onChange={(e) => patch({ id: e.target.value })} />
              </label>
              <label style={{ flex: "0 0 150px" }}>
                <span className="field-label">Simpan ke</span>
                <select value={targetFile} disabled={Boolean(selectedId)} onChange={(e) => setTargetFile(e.target.value)}>
                  {files.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="field-label">Deskripsi</span>
              <input value={draft.description ?? ""} onChange={(e) => patch({ description: e.target.value })} />
            </label>

            <div className="row" style={{ marginBottom: 12 }}>
              <label style={{ flex: "0 0 110px" }}>
                <span className="field-label">Method</span>
                <select
                  value={typeof draft.request?.method === "string" ? draft.request.method : "*"}
                  onChange={(e) => patchRequest({ method: e.target.value })}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: "2 1 220px" }}>
                <span className="field-label">Path</span>
                <input
                  value={draft.request?.path ?? ""}
                  placeholder="/products atau /transactions/:id"
                  onChange={(e) => patchRequest({ path: e.target.value })}
                />
              </label>
              <label style={{ flex: "0 0 100px" }}>
                <span className="field-label">Status</span>
                <input
                  type="number"
                  value={draft.response?.status ?? 200}
                  onChange={(e) => patchResponse({ status: Number(e.target.value) })}
                />
              </label>
              <label style={{ flex: "0 0 110px" }}>
                <span className="field-label">Delay (ms)</span>
                <input
                  type="number"
                  value={draft.response?.delayMs ?? 0}
                  onChange={(e) => patchResponse({ delayMs: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="row checks" style={{ marginBottom: 12 }}>
              <label className="check">
                <input type="checkbox" checked={draft.enabled !== false} onChange={(e) => patch({ enabled: e.target.checked })} />
                <span className="field-label">Aktif</span>
              </label>
              <label className="check">
                <span className="field-label">Priority</span>
                <input
                  type="number"
                  value={draft.priority ?? 0}
                  onChange={(e) => patch({ priority: Number(e.target.value) })}
                  style={{ width: 70 }}
                />
              </label>
              <label className="check">
                <input type="checkbox" checked={rawMode} onChange={(e) => setRawMode(e.target.checked)} />
                <span className="field-label">Mode JSON mentah (sequence dll.)</span>
              </label>
            </div>

            {rawMode ? (
              <JsonField
                label="Rule utuh (JSON)"
                rows={22}
                value={{ ...draft, _source: undefined }}
                onChange={(v) => v && setDraft(v as MockRule)}
              />
            ) : (
              <>
                <JsonField
                  label='Match query — mis. { "product": "PLP" }'
                  rows={4}
                  value={draft.request?.query}
                  onChange={(v) => patchRequest({ query: v as MockRule["request"]["query"] })}
                  placeholder='{ "product": "PLP" }'
                />
                <JsonField
                  label='Match header — mis. { "x-mock-case": "DECLINED" }'
                  rows={3}
                  value={draft.request?.headers}
                  onChange={(v) => patchRequest({ headers: v as MockRule["request"]["headers"] })}
                />
                <JsonField
                  label='Match body — dot-path didukung, mis. { "amount": { "$gt": 1000000 } }'
                  rows={4}
                  value={draft.request?.body}
                  onChange={(v) => patchRequest({ body: v as MockRule["request"]["body"] })}
                />
                <JsonField
                  label="Response body — edit di sini untuk mengubah response message"
                  rows={14}
                  value={draft.response?.body}
                  onChange={(v) => patchResponse({ body: v })}
                />
                <JsonField
                  label="Response header (opsional)"
                  rows={3}
                  value={draft.response?.headers}
                  onChange={(v) => patchResponse({ headers: v as Record<string, string> | undefined })}
                />
              </>
            )}

            <div className="row" style={{ marginTop: 4, alignItems: "center" }}>
              <button onClick={save}>Simpan</button>
              {selectedId && (
                <button onClick={remove} className="danger">
                  Hapus
                </button>
              )}
              <span className="muted" style={{ fontSize: 12, flex: "1 1 auto" }}>
                {status}
              </span>
            </div>
          </div>
        )}

        {draft && <Tester rule={draft} />}
      </section>
    </div>
  );
}

function formatMethod(rule: MockRule): string {
  const m = rule.request?.method ?? "*";
  return Array.isArray(m) ? m.join("/") : m;
}

/** Panel uji coba: kirim request sungguhan ke /api/mock lalu tampilkan hasilnya. */
function Tester({ rule }: { rule: MockRule }) {
  const suggestedUrl = useMemo(() => {
    const path = (rule.request?.path ?? "/").replace(/:(\w+)/g, "123");
    const query = Object.entries(rule.request?.query ?? {})
      .filter(([, v]) => typeof v !== "object" || v === null)
      .map(([k, v]) => k + "=" + encodeURIComponent(String(v)))
      .join("&");
    return "/api/mock" + path + (query ? "?" + query : "");
  }, [rule]);

  const method =
    typeof rule.request?.method === "string" && rule.request.method !== "*" ? rule.request.method : "GET";

  const [url, setUrl] = useState(suggestedUrl);
  const [payload, setPayload] = useState("{}");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setUrl(suggestedUrl), [suggestedUrl]);

  const send = async () => {
    setBusy(true);
    setResult(null);
    const started = Date.now();
    try {
      const init: RequestInit = { method, cache: "no-store" };
      if (method !== "GET" && method !== "HEAD") {
        init.headers = { "content-type": "application/json" };
        init.body = payload;
      }
      const res = await fetch(url, init);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* biarkan sebagai teks mentah */
      }
      const meta =
        "HTTP " + res.status + " · " + (Date.now() - started) + "ms · rule: " + (res.headers.get("x-mock-rule") ?? "none");
      setResult(meta + "\n\n" + pretty);
    } catch (e) {
      setResult("Request gagal: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2 style={{ marginTop: 0 }}>Coba request</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="method" style={{ flex: "0 0 auto", alignSelf: "center" }}>
          {method}
        </span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} style={{ flex: "1 1 300px" }} />
        <button onClick={send} disabled={busy}>
          {busy ? "Mengirim..." : "Kirim"}
        </button>
      </div>
      {method !== "GET" && method !== "HEAD" && (
        <textarea value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} className="mono" />
      )}
      {result && <pre>{result}</pre>}
    </div>
  );
}
