"use client";

import { useEffect, useState } from "react";
import { ageLabel, ageMs, money, signedMoney } from "@/desk/fmt";
import { Tip } from "@/desk/tip";
import type { DeskPayload } from "@/lib/desk-types";
import { bookCap, equityFloor } from "@/lib/loop-policy";
import { mixCap } from "@/governor/mix";

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
  const now = new Date();
  const liveBookFrac = bookCap(now);
  const liveMixCap = mixCap(now);
  const liveFloor = equityFloor(now);
  const bookCapUsd = cap?.bookCapUsd || (Number.isFinite(equity) ? liveBookFrac * equity : 0);

  return (
    <div className="stack">
      {desk?.error ? <p className="notice">{desk.error}</p> : null}
      <article className="panel">
        <header className="panel-head">
          <Tip tip="Unattended RTH loop status from hackathon/loop-status.json." below>
            Heartbeat
          </Tip>
        </header>
        <div className="panel-body">
          <div
            className="title"
            data-tip={
              beat === "live"
                ? "Tick within ~90s — loop looks healthy."
                : beat === "late"
                  ? "Tick 90–180s ago — may be mid-scan."
                  : beat === "stale"
                    ? "No recent tick — is npm run loop still up?"
                    : "No loop-status.json yet."
            }
            style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 0 }}
          >
            <span className={`dot ${beat === "live" ? "live" : beat === "late" ? "idle" : "stale"}`} />
            {beat === "idle" ? "Loop idle" : beat === "live" ? "Loop live" : beat === "late" ? "Loop late" : "Loop stale"}
          </div>
          <div className="kv">
            <Tip tip="Age of the last saved loop tick.">Last tick</Tip>
            <span className="mono">{loop ? ageLabel(loop.at) : "—"}</span>
            <Tip tip="America/New_York session date for the open counter.">Session</Tip>
            <span className="mono">{loop?.sessionYmd ?? "—"}</span>
            <Tip tip="Alpaca get_clock.is_open — new risk only when cash is open.">Clock</Tip>
            <span>{loop ? (loop.isOpen ? "Cash open" : "Cash closed") : desk?.clock?.is_open ? "Cash open" : "—"}</span>
            <Tip tip="HALT file or equity at/under the live floor ($90k Tue, $85k from Wed). No new risk; flatten still allowed.">
              Halt
            </Tip>
            <span className={desk?.halt || loop?.halt ? "down" : "up"}>
              {desk?.halt || loop?.halt ? "HALT" : "Clear"}
            </span>
            <Tip tip="Last 15 minutes of RTH: cancel working DAY opens; no new risk.">Last 15</Tip>
            <span>{loop?.lastFifteen ? "No new risk" : "Open"}</span>
            <Tip tip="LOOP_SEND=true lets the loop POST MCP-shaped paper orders. Otherwise print only.">
              Door send
            </Tip>
            <span className={send ? "up" : ""}>{send ? "LOOP_SEND on" : "Print only"}</span>
            <Tip tip="Paper API keys loaded in this process.">Paper keys</Tip>
            <span>{desk?.paperReady ? "Ready" : "Missing"}</span>
            <Tip tip="Why this tick did not open new risk, if any.">Skip</Tip>
            <span>{loop?.skip ?? "—"}</span>
            <Tip tip="Open, close, or cancel payload waiting on the paper door.">Pending</Tip>
            <span className="mono">
              {loop?.pending
                ? `${loop.pending.kind} · ${loop.pending.sent ? "sent" : "ready"}${loop.pending.error ? ` · ${loop.pending.error}` : ""}`
                : "None"}
            </span>
            <Tip tip="Door dispatch note from the last tick.">Note</Tip>
            <span>{loop?.note ?? "Run npm run loop in pop-alpha-agent."}</span>
          </div>
        </div>
      </article>

      <article className="panel">
        <header className="panel-head">
          <Tip tip="Live use of the Risk gates — book and mix. No daily open count." below>
            Capacity
          </Tip>
        </header>
        <div className="panel-body">
          <div className="kv">
            <Tip tip="Filled pop-alpha opens this cash session (counter only). Close fills do not count.">
              Opens today
            </Tip>
            <span className="mono">{loop?.opensThisSession ?? 0}</span>
            <Tip tip="Names stopped out today. The loop will not re-open them this cash session.">
              Stopped today
            </Tip>
            <span className="mono">
              {(loop?.stoppedThisSession ?? []).length ? loop!.stoppedThisSession!.join(" ") : "—"}
            </span>
            <Tip tip="Open defined-risk |max loss| × qty vs live book % (10% Tue, 15% from Wed).">Book</Tip>
            <span className="mono">
              {money(bookUsd)} / {money(bookCapUsd)} ({Math.round(liveBookFrac * 100)}%)
            </span>
            <Tip tip="New risk stops at this equity. Paired with the live book hole ($90k Tue, $85k from Wed).">
              Equity floor
            </Tip>
            <span className="mono">{money(liveFloor)}</span>
            <Tip tip="Open + working DAY bull verticals. Cap 4 Tue / 5 from Wed.">Mix bull</Tip>
            <span className="mono">
              {mix.bull} / {liveMixCap}
            </span>
            <Tip tip="Open + working DAY bear verticals. Cap 4 Tue / 5 from Wed.">Mix bear</Tip>
            <span className="mono">
              {mix.bear} / {liveMixCap}
            </span>
            <Tip tip="Open + working DAY irons. Cap 4 Tue / 5 from Wed.">Mix iron</Tip>
            <span className="mono">
              {mix.iron} / {liveMixCap}
            </span>
            <Tip tip="Underlyings with an open package. Second package in a name is denied.">
              Open names
            </Tip>
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
