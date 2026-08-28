"use client";

import { useCallback, useEffect, useState } from "react";
import { HoldMapGrid } from "@/desk/hold-map";
import { money, num, pct, pnlClass, templateLabel, when } from "@/desk/fmt";
import type { DeskPayload } from "@/lib/desk-types";

export function HomeClient() {
  const [desk, setDesk] = useState<DeskPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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

  async function scan(source: "demo" | "paper") {
    setBusy(source);
    setError(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, symbol: "SPY" }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) setError(json.error ?? "Scan failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setBusy(null);
    }
  }

  async function copyDoor() {
    if (!desk?.lastScan?.mcp) return;
    await navigator.clipboard.writeText(JSON.stringify(desk.lastScan.mcp, null, 2));
  }

  const scanRow = desk?.lastScan;
  const decision = scanRow?.decision;

  return (
    <>
      <div className="toolbar">
        <button type="button" onClick={() => void scan("demo")} disabled={busy != null}>
          {busy === "demo" ? "Scoring demo…" : "Score demo chain"}
        </button>
        <button className="ghost" type="button" onClick={() => void scan("paper")} disabled={busy != null || !desk?.paperReady}>
          {busy === "paper" ? "Scoring SPY…" : "Score SPY paper tape"}
        </button>
        {error ? <p className="notice">{error}</p> : null}
      </div>

      <div className="grid">
        <article className="panel">
          <header className="panel-head">Proposal</header>
          <div className="panel-body">
            {!decision ? (
              <p>No scan yet. Score the demo chain to mint a hold map, or score SPY from paper.</p>
            ) : decision.action === "no_trade" ? (
              <>
                <span className="pill veto">Veto</span>
                <p style={{ marginTop: 10, color: "var(--ink)" }}>{decision.reason}</p>
              </>
            ) : (
              <>
                <span className="pill propose">Propose</span>
                <div className="title">
                  {decision.package.underlying} {templateLabel(decision.package.template)}
                </div>
                <div className="kv">
                  <span>Expiry</span>
                  <span className="mono">
                    {decision.package.expiration} · {decision.package.dte} DTE
                  </span>
                  <span>Qty / limit</span>
                  <span className="mono">
                    {decision.qty} @ {num(decision.limit)} {decision.package.credit ? "credit" : "debit"}
                  </span>
                  <span>Max profit</span>
                  <span className="mono up">{money(decision.package.maxProfit)}</span>
                  <span>Max loss</span>
                  <span className="mono down">{money(decision.package.maxLoss)}</span>
                  <span>POP expiry</span>
                  <span className="mono">{pct(decision.map.popAtExpiration)}</span>
                  <span>Manage by</span>
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
          <header className="panel-head">Hold map</header>
          <div className="panel-body">
            {decision?.action === "propose" ? (
              <HoldMapGrid map={decision.map} manageByDays={decision.manageByDays} />
            ) : (
              <p>Cells are P(path has reached that % of max profit by that day).</p>
            )}
          </div>
        </article>

        <article className="panel">
          <header className="panel-head">Ledger</header>
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
            MCP door
            {scanRow?.mcp ? (
              <button type="button" className="btn ghost" onClick={() => void copyDoor()} style={{ height: 22, fontSize: 10 }}>
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
          <header className="panel-head">Paper blotter</header>
          <div className="panel-body" style={{ padding: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 10 }}>Symbol</th>
                  <th>Qty</th>
                  <th>Entry</th>
                  <th>Mark</th>
                  <th>UPL</th>
                </tr>
              </thead>
              <tbody>
                {(desk?.positions ?? []).map((p) => (
                  <tr key={p.symbol}>
                    <td className="mono" style={{ paddingLeft: 10 }}>
                      {p.symbol}
                    </td>
                    <td className="mono">
                      {p.side} {p.qty}
                    </td>
                    <td className="mono">{p.avg_entry_price}</td>
                    <td className="mono">{p.current_price}</td>
                    <td className={`mono ${pnlClass(Number(p.unrealized_pl))}`}>{money(p.unrealized_pl)}</td>
                  </tr>
                ))}
                {!desk?.positions.length ? (
                  <tr>
                    <td colSpan={5} style={{ paddingLeft: 10, color: "var(--dim)" }}>
                      No open paper positions, or keys not loaded.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </>
  );
}
