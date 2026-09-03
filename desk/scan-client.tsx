"use client";

import { useEffect, useMemo, useState } from "react";
import { num, pct, when } from "@/desk/fmt";
import { Tip } from "@/desk/tip";
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
        <header className="panel-head">
          <Tip tip="Snapshot from the last cash-session tape build." below>
            Last scan
          </Tip>
        </header>
        <div className="panel-body">
          {!tape ? (
            <p>No tape yet. The loop writes one here on the next cash-session scan.</p>
          ) : (
            <div className="kv">
              <Tip tip="When the loop last built this universe.">When</Tip>
              <span className="mono">{when(tape.at)}</span>
              <Tip tip="Names that cleared filters and made the scored tape. From Thursday this is the profitable-book cluster.">On tape</Tip>
              <span className="mono">{tape.kept.join(" ") || "—"}</span>
              <Tip tip="Thursday lean: profitable open packages first, then names that trade with those underlyings.">
                Cluster
              </Tip>
              <span className="mono">
                {tape.side
                  ? `${tape.sideSource === "book" ? "book" : tape.sideSource === "session" ? "session" : ""} ${tape.side}${tape.cluster ? ` · ${tape.cluster}` : ""}`.trim()
                  : "—"}
              </span>
              <Tip tip="Dropped because a package is already open in that name.">Already open</Tip>
              <span className="mono">{tape.alreadyOpen.join(" ") || "—"}</span>
              <Tip tip="Stopped out earlier this cash session. The loop will not re-open them today.">
                Stopped today
              </Tip>
              <span className="mono">{(tape.stoppedThisSession ?? []).join(" ") || "—"}</span>
              <Tip tip="Governor propose winner, or no_trade.">Winner</Tip>
              <span className="mono">
                {tape.decision === "propose" ? tape.winner ?? "propose" : tape.decision ?? "—"}
              </span>
              <Tip tip="Optional model JSON hint. Model never places; governor still owns the pick.">
                Thesis
              </Tip>
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
        <button
          type="button"
          className={filter === "all" ? "" : "ghost"}
          onClick={() => setFilter("all")}
          data-tip="Show every name the tape builder considered."
          data-tip-pos="below"
        >
          All {tape?.rows.length ?? 0}
        </button>
        <button
          type="button"
          className={filter === "kept" ? "" : "ghost"}
          onClick={() => setFilter("kept")}
          data-tip="Only names that made the scored tape (including SPY/QQQ backstop on Tue/Wed)."
          data-tip-pos="below"
        >
          On tape {tape?.rows.filter((r) => r.kept).length ?? 0}
        </button>
        <button
          type="button"
          className={filter === "dropped" ? "" : "ghost"}
          onClick={() => setFilter("dropped")}
          data-tip="Names that failed a filter or sat below the tape cap."
          data-tip-pos="below"
        >
          Dropped {tape?.rows.filter((r) => !r.kept).length ?? 0}
        </button>
      </div>

      <article className="panel">
        <header className="panel-head">
          <Tip tip="Actives + movers, then Thursday names that trade with the profitable open packages (or SPY/QQQ backstop earlier in the week)." below>
            Universe
          </Tip>
        </header>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data wrap">
            <thead>
              <tr>
                <th>Name</th>
                <th>
                  <Tip tip="Latest stock print used by the tape filter." below>
                    Last
                  </Tip>
                </th>
                <th>
                  <Tip tip="Session change vs prior close. Thursday keeps one side only." below>
                    Δ
                  </Tip>
                </th>
                <th>
                  <Tip tip="Most-active volume when available — used to rank the tape on Tue/Wed." below>
                    Volume
                  </Tip>
                </th>
                <th>
                  <Tip tip="Kept on tape, index backstop, or dropped." below>
                    Gate
                  </Tip>
                </th>
                <th>
                  <Tip tip="Why the name passed or failed." below>
                    Reason
                  </Tip>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.symbol}-${row.reason}`}>
                  <td className="mono">{row.symbol}</td>
                  <td className="mono">{row.last > 0 ? num(row.last) : "—"}</td>
                  <td className={`mono ${row.changePct != null && row.changePct !== 0 ? (row.changePct > 0 ? "up" : "down") : ""}`}>
                    {row.changePct != null ? `${row.changePct > 0 ? "+" : ""}${pct(row.changePct)}` : "—"}
                  </td>
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
                  <td colSpan={6} style={{ color: "var(--dim)" }}>
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
