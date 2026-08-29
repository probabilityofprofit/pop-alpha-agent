"use client";

import { useState } from "react";
import Link from "next/link";
import { num } from "@/desk/fmt";
import type { ChainRow } from "@/lib/desk-types";

type ChainRes = { ok: boolean; symbol?: string; spot?: number | null; rows: ChainRow[]; error?: string };

export function TapeClient() {
  const [symbol, setSymbol] = useState("SPY");
  const [data, setData] = useState<ChainRes | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setScanMsg(null);
    try {
      const res = await fetch(`/api/chain?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      setData((await res.json()) as ChainRes);
    } finally {
      setBusy(false);
    }
  }

  async function score() {
    setBusy(true);
    setScanMsg(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "paper", symbol }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; scan?: { decision: { action: string; reason?: string } } };
      if (!json.ok) setScanMsg(json.error ?? "Scan failed.");
      else if (json.scan?.decision.action === "no_trade") setScanMsg(json.scan.decision.reason ?? "No trade.");
      else setScanMsg("Proposal posted on Desk.");
    } finally {
      setBusy(false);
    }
  }

  const byExpiry = new Map<string, ChainRow[]>();
  for (const row of data?.rows ?? []) {
    const list = byExpiry.get(row.expiration) ?? [];
    list.push(row);
    byExpiry.set(row.expiration, list);
  }

  return (
    <>
      <div className="toolbar">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          aria-label="Underlying"
          className="mono"
          data-tip="Underlying to load. Desk reads paper chain only."
          data-tip-pos="below"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          data-tip="Fetch the 0–21 DTE option chain from Alpaca paper/data."
          data-tip-pos="below"
        >
          {busy ? "Loading…" : "Load 0–21 DTE chain"}
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => void score()}
          disabled={busy}
          data-tip="Dry-run the governor on this name. Posts a proposal to Desk. Does not place."
          data-tip-pos="below"
        >
          Preview this name
        </button>
        <Link
          href="/scan"
          style={{ color: "var(--dim)", fontSize: 12 }}
          data-tip="Names the unattended loop kept or dropped on the last tape."
          data-tip-pos="below"
        >
          Last universe
        </Link>
        {data?.spot != null ? (
          <span className="mono" style={{ color: "var(--dim)", fontSize: 12 }}>
            {data.symbol} {num(data.spot)}
          </span>
        ) : null}
      </div>
      {data?.error ? <p className="notice">{data.error}</p> : null}
      {scanMsg ? <p style={{ margin: 0, color: "var(--dim)", fontSize: 12 }}>{scanMsg}</p> : null}

      {[...byExpiry.entries()].map(([expiry, rows]) => {
        const strikes = [...new Set(rows.map((r) => r.strike))].sort((a, b) => a - b);
        return (
          <article className="panel" key={expiry}>
            <header className="panel-head">{expiry}</header>
            <div className="panel-body" style={{ padding: 0 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Strike</th>
                    <th>Call bid</th>
                    <th>Call ask</th>
                    <th>Put bid</th>
                    <th>Put ask</th>
                  </tr>
                </thead>
                <tbody>
                  {strikes.map((k) => {
                    const call = rows.find((r) => r.strike === k && r.right === "call");
                    const put = rows.find((r) => r.strike === k && r.right === "put");
                    return (
                      <tr key={k}>
                        <td className="mono">{k}</td>
                        <td className="mono">{num(call?.bid ?? null)}</td>
                        <td className="mono">{num(call?.ask ?? null)}</td>
                        <td className="mono">{num(put?.bid ?? null)}</td>
                        <td className="mono">{num(put?.ask ?? null)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        );
      })}
    </>
  );
}
