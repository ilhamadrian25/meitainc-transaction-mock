"use client";

import { useEffect, useState } from "react";

/** Textarea JSON dengan validasi live; hanya melaporkan nilai saat JSON valid. */
export function JsonField({
  label,
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  label: string;
  value: unknown;
  onChange: (next: unknown) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => stringify(value));
  const [error, setError] = useState<string | null>(null);

  // Sinkron ulang saat rule lain dipilih.
  useEffect(() => {
    setText(stringify(value));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stringify(value)]);

  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <textarea
        rows={rows}
        value={text}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === "") {
            setError(null);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(next));
            setError(null);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        style={{ marginTop: 4, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12 }}
      />
      {error && <span className="error" style={{ fontSize: 12 }}>JSON invalid: {error}</span>}
    </label>
  );
}

function stringify(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}
