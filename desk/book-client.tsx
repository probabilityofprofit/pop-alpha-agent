"use client";

import { useEffect, useState } from "react";
import { money, pnlClass, when } from "@/desk/fmt";
import type { DeskPayload } from "@/lib/desk-types";

export function BookClient() {
  const [desk, setDesk] = useState<DeskPayload | null>(null);

  useEffect(() => {
    void fetch("/api/desk", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: DeskPayload) => setDesk(j));
  }, []);

  return (
    <div className="stack">
      <article className="panel">
        <header className="panel-head">Open positions</header>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Class</th>
                <th>Qty</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>UPL</th>
              </tr>
            </thead>
            <tbody>
              {(desk?.positions ?? []).map((p) => (
                <tr key={p.symbol}>
                  <td className="mono">{p.symbol}</td>
                  <td>{p.asset_class}</td>
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
                  <td colSpan={6} style={{ color: "var(--dim)" }}>
                    None.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <header className="panel-head">Recent orders</header>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>Class</th>
                <th>Limit</th>
                <th>Fill</th>
                <th>Client id</th>
              </tr>
            </thead>
            <tbody>
              {(desk?.orders ?? []).map((o) => (
                <tr key={o.id}>
                  <td className="mono">{when(o.submitted_at)}</td>
                  <td>{o.status}</td>
                  <td className="mono">{o.order_class}</td>
                  <td className="mono">{o.limit_price ?? "—"}</td>
                  <td className="mono">{o.filled_avg_price ?? "—"}</td>
                  <td className="mono">{o.client_order_id}</td>
                </tr>
              ))}
              {!desk?.orders.length ? (
                <tr>
                  <td colSpan={6} style={{ color: "var(--dim)" }}>
                    None loaded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <header className="panel-head">Friday test book (does not score)</header>
        <div className="panel-body">
          <pre className="door" style={{ whiteSpace: "pre-wrap", maxHeight: 360 }}>
            {desk?.testBook || "hackathon/TEST_BOOK.md"}
          </pre>
        </div>
      </article>
    </div>
  );
}
