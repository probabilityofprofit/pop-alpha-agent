"use client";

import { useEffect, useState } from "react";
import { ageLabel, ageMs, money, signedMoney } from "@/desk/fmt";
import type { DeskPayload } from "@/lib/desk-types";
import { BOOK_CAP, EQUITY_FLOOR, SESSION_OPEN_CAP } from "@/lib/loop-policy";
import { MIX_CAP } from "@/governor/mix";

function pulse(at?: string): "live" | "late" | "stale" | "idle" {
  const ms = ageMs(at);
  if (ms == null) return "idle";
  if (ms < 90_000) return "live";
  if (ms < 180_000) return "late";
  return "stale";
}

export function LoopClient() {
  const [desk, setDesk] = useState<DeskPayload | null>(null);

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

  const loop = desk?.lastLoop ?? null;
  const beat = pulse(loop?.at);
  const send = loop?.send ?? desk?.loopSend ?? false;
  const cap = desk?.capacity;
  const equity = Number(desk?.account?.equity);
  const mix = cap?.mix ?? { bull: 0, bear: 0, iron: 0 };
  const bookUsd = cap?.bookUsd ?? 0;
  const bookCap = cap?.bookCapUsd || (Number.isFinite(equity) ? BOOK_CAP * equity : 0);

  return (
    <div className="stack">
      {desk?.error ? <p className="notice">{desk.error}</p> : null}
      <article className="panel">
        <header className="panel-head">Heartbeat</header>
        <div className="panel-body">
          <div className="title" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0 }}>
            <span className={`dot ${beat === "live" ? "live" : beat === "late" ? "idle" : "stale"}`} />
            {beat === "idle" ? "Loop idle" : beat === "live" ? "Loop live" : beat === "late" ? "Loop late" : "Loop stale"}
          </div>
          <div className="kv">
            <span>Last tick</span>
            <span className="mono">{loop ? ageLabel(loop.at) : "—"}</span>
            <span>Session</span>
            <span className="mono">{loop?.sessionYmd ?? "—"}</span>
            <span>Clock</span>
            <span>{loop ? (loop.isOpen ? "Cash open" : "Cash closed") : desk?.clock?.is_open ? "Cash open" : "—"}</span>
            <span>Halt</span>
            <span className={desk?.halt || loop?.halt ? "down" : "up"}>
              {desk?.halt || loop?.halt ? "HALT" : "Clear"}
            </span>
            <span>Last 15</span>
            <span>{loop?.lastFifteen ? "No new risk" : "Open"}</span>
            <span>Door send</span>
            <span className={send ? "up" : ""}>{send ? "LOOP_SEND on" : "Print only"}</span>
            <span>Paper keys</span>
            <span>{desk?.paperReady ? "Ready" : "Missing"}</span>
            <span>Skip</span>
            <span>{loop?.skip ?? "—"}</span>
            <span>Pending</span>
            <span className="mono">
              {loop?.pending
                ? `${loop.pending.kind} · ${loop.pending.sent ? "sent" : "ready"}${loop.pending.error ? ` · ${loop.pending.error}` : ""}`
                : "None"}
            </span>
            <span>Note</span>
            <span>{loop?.note ?? "Run npm run loop in pop-alpha-agent."}</span>
          </div>
        </div>
      </article>

      <article className="panel">
        <header className="panel-head">Capacity</header>
        <div className="panel-body">
          <div className="kv">
            <span>Session opens</span>
            <span className="mono">
              {loop?.opensThisSession ?? 0} / {SESSION_OPEN_CAP}
            </span>
            <span>Book</span>
            <span className="mono">
              {money(bookUsd)} / {money(bookCap)} ({Math.round(BOOK_CAP * 100)}%)
            </span>
            <span>Equity floor</span>
            <span className="mono">{money(EQUITY_FLOOR)}</span>
            <span>Mix bull</span>
            <span className="mono">
              {mix.bull} / {MIX_CAP}
            </span>
            <span>Mix bear</span>
            <span className="mono">
              {mix.bear} / {MIX_CAP}
            </span>
            <span>Mix iron</span>
            <span className="mono">
              {mix.iron} / {MIX_CAP}
            </span>
            <span>Open names</span>
            <span className="mono">{cap?.names.length ? cap.names.join(" ") : "—"}</span>
          </div>
        </div>
      </article>

      <article className="panel">
        <header className="panel-head">Thesis / exits</header>
        <div className="panel-body">
          {loop?.thesis ? (
            <div className="kv">
              <span>Model</span>
              <span>
                {loop.thesis.skip
                  ? loop.thesis.reason ?? "Skipped"
                  : `${loop.thesis.hint?.underlying ?? "—"} ${loop.thesis.hint?.structure ?? ""}`}
              </span>
              {loop.thesis.hint?.thesis ? (
                <>
                  <span>Thesis</span>
                  <span>{loop.thesis.hint.thesis}</span>
                </>
              ) : null}
            </div>
          ) : (
            <p>No thesis on the last tick.</p>
          )}
          {(loop?.exits ?? []).length ? (
            <table className="data wrap" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Reason</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {loop!.exits!.map((row) => (
                  <tr key={`${row.underlying}-${row.reason}`}>
                    <td className="mono">{row.underlying}</td>
                    <td>{row.reason}</td>
                    <td className="mono">{signedMoney(row.pnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ marginTop: 10 }}>No exit this tick.</p>
          )}
        </div>
      </article>
    </div>
  );
}
