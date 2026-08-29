"use client";

import { useEffect, useMemo, useState } from "react";
import { field, when } from "@/desk/fmt";
import type { LedgerRow } from "@/lib/desk-types";

const FALLBACK_KINDS = ["cycle", "score", "order", "fill", "cancel", "exit", "halt", "mark"];

function summary(row: LedgerRow): string {
  return (
    field(row, "underlying") ||
    field(row, "symbol") ||
    field(row, "orderId") ||
    (Array.isArray(row.tape) ? row.tape.filter((s) => typeof s === "string").slice(0, 6).join(" ") : "")
  );
}

export function LedgerClient() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [kinds, setKinds] = useState<string[]>(FALLBACK_KINDS);
  const [filter, setFilter] = useState("cycle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      void fetch("/api/ledger", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { rows?: LedgerRow[]; kinds?: string[] }) => {
          setRows(j.rows ?? []);
          if (j.kinds?.length) setKinds(j.kinds);
          setError(null);
        })
        .catch(() => setError("Ledger read failed."));
    };
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const shown = useMemo(
    () => (filter === "all" ? rows : rows.filter((row) => String(row.kind ?? "") === filter)),
    [filter, rows],
  );

  return (
    <div className="stack">
      <div className="toolbar">
        <button type="button" className={filter === "all" ? "" : "ghost"} onClick={() => setFilter("all")}>
          All {rows.length}
        </button>
        {kinds.map((kind) => {
          const n = rows.filter((row) => row.kind === kind).length;
          return (
            <button
              key={kind}
              type="button"
              className={filter === kind ? "" : "ghost"}
              onClick={() => setFilter(kind)}
            >
              {kind} {n}
            </button>
          );
        })}
      </div>
      {error ? <p className="notice">{error}</p> : null}
      <article className="panel">
        <header className="panel-head">
          Ledger
          <span className="mono" style={{ color: "var(--faint)", fontWeight: 500 }}>
            {shown.length} / {rows.length} · hackathon/ledger.jsonl
          </span>
        </header>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data wrap">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Name</th>
                <th>Decision</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr key={`${row.ts}-${row.kind}-${i}`}>
                  <td className="mono">{when(typeof row.ts === "string" ? row.ts : undefined)}</td>
                  <td className="mono">
                    {field(row, "kind")}
                    {field(row, "scope") ? ` · ${field(row, "scope")}` : ""}
                  </td>
                  <td className="mono">{summary(row) || "—"}</td>
                  <td>{field(row, "decision") || field(row, "template") || "—"}</td>
                  <td>{field(row, "reason") || field(row, "note") || "—"}</td>
                </tr>
              ))}
              {!shown.length ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--dim)" }}>
                    Empty. The loop appends a cycle row every tick, including no-trade.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
