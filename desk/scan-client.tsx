"use client";

import { useEffect, useMemo, useState } from "react";
import { num, when } from "@/desk/fmt";
import type { DeskPayload } from "@/lib/desk-types";

export function ScanClient() {
  const [desk, setDesk] = useState<DeskPayload | null>(null);
  const [filter, setFilter] = useState<"all" | "kept" | "dropped">("all");

  useEffect(() => {
    const load = () => {
      void fetch("/api/desk", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: DeskPayload) => setDesk(j));
    };
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const tape = desk?.lastTape ?? null;
  const rows = useMemo(() => {
    const all = tape?.rows ?? [];
    if (filter === "kept") return all.filter((r) => r.kept);
    if (filter === "dropped") return all.filter((r) => !r.kept);
    return all;
  }, [filter, tape]);

  return (
    <div className="stack">
      <p style={{ margin: 0, color: "var(--dim)", fontSize: 12 }}>
        Last universe the loop scored. Chain preview stays on Tape.
      </p>
      <article className="panel">
        <header className="panel-head">Last scan</header>
        <div className="panel-body">
          {!tape ? (
            <p>No tape yet. The loop writes one here on the next cash-session scan.</p>
          ) : (
            <div className="kv">
              <span>When</span>
              <span className="mono">{when(tape.at)}</span>
              <span>On tape</span>
              <span className="mono">{tape.kept.join(" ") || "—"}</span>
              <span>Already open</span>
              <span className="mono">{tape.alreadyOpen.join(" ") || "—"}</span>
              <span>Winner</span>
              <span className="mono">
                {tape.decision === "propose" ? tape.winner ?? "propose" : tape.decision ?? "—"}
              </span>
              <span>Thesis</span>
              <span>
                {tape.thesis?.skip
                  ? tape.thesis.reason ?? "Skipped"
                  : [tape.thesis?.underlying, tape.thesis?.structure, tape.thesis?.reason].filter(Boolean).join(" · ") ||
                    "—"}
              </span>
            </div>
          )}
        </div>
      </article>

      <div className="toolbar">
        <button type="button" className={filter === "all" ? "" : "ghost"} onClick={() => setFilter("all")}>
          All {tape?.rows.length ?? 0}
        </button>
        <button type="button" className={filter === "kept" ? "" : "ghost"} onClick={() => setFilter("kept")}>
          On tape {tape?.rows.filter((r) => r.kept).length ?? 0}
        </button>
        <button type="button" className={filter === "dropped" ? "" : "ghost"} onClick={() => setFilter("dropped")}>
          Dropped {tape?.rows.filter((r) => !r.kept).length ?? 0}
        </button>
      </div>

      <article className="panel">
        <header className="panel-head">Universe</header>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data wrap">
            <thead>
              <tr>
                <th>Name</th>
                <th>Last</th>
                <th>Volume</th>
                <th>Gate</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.symbol}-${row.reason}`}>
                  <td className="mono">{row.symbol}</td>
                  <td className="mono">{row.last > 0 ? num(row.last) : "—"}</td>
                  <td className="mono">{row.optionVolume > 0 ? row.optionVolume.toLocaleString("en-US") : "—"}</td>
                  <td>
                    <span className={`pill ${row.kept ? "propose" : "veto"}`}>
                      {row.kept ? (row.backstop ? "Backstop" : "Kept") : "Drop"}
                    </span>
                  </td>
                  <td>{row.reason}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--dim)" }}>
                    Empty until the loop builds a tape.
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
