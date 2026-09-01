"use client";

import { useCallback, useEffect, useState } from "react";
import { BlotterTable } from "@/desk/blotter-table";
import { HoldMapGrid } from "@/desk/hold-map";
import { money, num, pct, templateLabel, when } from "@/desk/fmt";
import { Tip } from "@/desk/tip";
import type { DeskPayload } from "@/lib/desk-types";
import { groupPositionsForBlotter } from "@/lib/packages-from-positions";

export function HomeClient() {
  const [desk, setDesk] = useState<DeskPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/desk", { cache: "no-store" });
    const json = (await res.json()) as DeskPayload;
    setDesk(json);
    if (json.error) setError(json.error);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function copyDoor() {
    if (!desk?.lastScan?.mcp) return;
    await navigator.clipboard.writeText(JSON.stringify(desk.lastScan.mcp, null, 2));
  }

  const scanRow = desk?.lastScan;
  const decision = scanRow?.decision;
  const openPackages = groupPositionsForBlotter(desk?.positions ?? []).length;

  return (
    <>
      {error ? <p className="notice">{error}</p> : null}
      {desk?.lastLoop ? (
        <p
          className="mono"
          data-tip="Last unattended loop tick. Open Loop for heartbeat and capacity."
          data-tip-pos="below"
          style={{ margin: 0, color: "var(--dim)", fontSize: 12 }}
        >
          Loop {when(desk.lastLoop.at)} · opens today {desk.lastLoop.opensThisSession} ·{" "}
          {desk.lastLoop.pending
            ? `MCP ${desk.lastLoop.pending.kind} ${desk.lastLoop.pending.sent ? "sent" : "ready"}`
            : desk.lastLoop.skip
              ? desk.lastLoop.skip
              : desk.lastLoop.note}
        </p>
      ) : (
        <p className="mono" style={{ margin: 0, color: "var(--faint)", fontSize: 12 }}>
          Loop idle. Run npm run loop in pop-alpha-agent.
        </p>
      )}

      <div className="grid">
        <article className="panel">
          <header className="panel-head">
            <Tip tip="Governor pick from the last scan. Desk never places the order." below>
              Proposal
            </Tip>
          </header>
          <div className="panel-body">
            {!decision ? (
              <p>No proposal yet. The loop writes one here when it scans.</p>
            ) : decision.action === "no_trade" ? (
              <>
                <span
                  className="pill veto"
                  data-tip="Governor vetoed — no MCP payload. Reason is the hard gate that failed."
                >
                  Veto
                </span>
                <p style={{ marginTop: 10, color: "var(--ink)" }}>{decision.reason}</p>
              </>
            ) : (
              <>
                <span
                  className="pill propose"
                  data-tip="Cleared size, book, mix, and Friday hold-map gates."
                >
                  Propose
                </span>
                <div className="title">
                  {decision.package.underlying} {templateLabel(decision.package.template)}
                </div>
                <div className="kv">
                  <Tip tip="One expiry per ticket. Contest window ends Fri 4 Sep.">Expiry</Tip>
                  <span className="mono">
                    {decision.package.expiration} · {decision.package.dte} DTE
                  </span>
                  <Tip tip="Qty = floor(1% equity ÷ |max loss|). Limit joins NBBO.">Qty / limit</Tip>
                  <span className="mono">
                    {decision.qty} @ {num(decision.limit)} {decision.package.credit ? "credit" : "debit"}
                  </span>
                  <Tip tip="Defined-risk max profit for this package × qty is not shown here — this is per 1× package.">
                    Max profit
                  </Tip>
                  <span className="mono up">{money(decision.package.maxProfit)}</span>
                  <Tip tip="Defined risk per 1× package. Book cap sums max loss × qty.">Max loss</Tip>
                  <span className="mono down">{money(decision.package.maxLoss)}</span>
                  <Tip tip="Share of Monte Carlo paths with mark P&L > 0 on the Friday / manage-by day. Gate ≥ 35.">
                    POP by Friday
                  </Tip>
                  <span className="mono">{pct(decision.map.popAtManageBy)}</span>
                  <Tip tip="Hold-map day used for gates — min(DTE, days to Fri 4 Sep), at least 1.">
                    Manage by
                  </Tip>
                  <span className="mono">day {decision.manageByDays}</span>
                </div>
                <table className="legs" style={{ marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th>Side</th>
                      <th>OCC</th>
                      <th>Bid</th>
                      <th>Ask</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.package.legs.map((leg) => (
                      <tr key={leg.occ}>
                        <td>
                          {leg.side} {leg.right}
                        </td>
                        <td className="mono">{leg.occ}</td>
                        <td className="mono">{num(leg.bid)}</td>
                        <td className="mono">{num(leg.ask)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </article>

        <article className="panel">
          <header className="panel-head">
            <Tip tip="Monte Carlo grid: P(path has reached that % of max profit by that day). Gates use the Friday row." below>
              Hold map
            </Tip>
          </header>
          <div className="panel-body">
            {decision?.action === "propose" ? (
              <HoldMapGrid map={decision.map} manageByDays={decision.manageByDays} />
            ) : (
              <p>Cells are P(path has reached that % of max profit by that day). Gates use the Friday row, not expiry.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <header className="panel-head">
            <Tip tip="Latest rows from hackathon/ledger.jsonl. Full journal is on Ledger." below>
              Ledger
            </Tip>
          </header>
          <div className="panel-body">
            <ol className="ledger">
              {(desk?.ledger ?? []).slice(0, 24).map((row, i) => (
                <li key={`${row.ts}-${i}`}>
                  <div className="meta mono">
                    {when(row.ts)} · {String(row.kind ?? "row")}
                  </div>
                  <div>
                    {String(row.underlying ?? "")} {String(row.decision ?? row.template ?? "")}{" "}
                    {row.reason ? String(row.reason) : ""}
                  </div>
                </li>
              ))}
              {!desk?.ledger.length ? <li>Empty. Scans append hackathon/ledger.jsonl.</li> : null}
            </ol>
          </div>
        </article>

        <article className="panel">
          <header className="panel-head">
            <Tip tip="MCP place_option_order JSON. This desk never POSTs it. Copy into Cursor or let LOOP_SEND send." below>
              MCP door
            </Tip>
            {scanRow?.mcp ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => void copyDoor()}
                style={{ height: 22, fontSize: 10 }}
                data-tip="Copy the mleg payload to the clipboard."
                data-tip-pos="below"
              >
                Copy JSON
              </button>
            ) : null}
          </header>
          <div className="panel-body">
            <p>
              This process never calls <span className="mono">place_option_order</span>. Copy the payload into Cursor.
            </p>
            {scanRow?.mcp ? (
              <pre className="door mono">{JSON.stringify(scanRow.mcp, null, 2)}</pre>
            ) : (
              <p>No door payload until a proposal clears the map.</p>
            )}
          </div>
        </article>

        <article className="panel span-2">
          <header className="panel-head">
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
              <Tip tip="Open paper option packages grouped by strategy. Hover column headers for field meanings." below>
                Paper blotter
              </Tip>
              <span
                className="mono"
                style={{ color: "var(--faint)", fontWeight: 500 }}
                data-tip="Number of open packages on the blotter (grouped legs, not raw option lines)."
                data-tip-pos="below"
              >
                ({openPackages})
              </span>
            </span>
          </header>
          <div className="panel-body" style={{ padding: 0 }}>
            <BlotterTable positions={desk?.positions ?? []} />
          </div>
        </article>
      </div>
    </>
  );
}
