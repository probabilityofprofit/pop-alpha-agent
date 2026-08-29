"use client";

import { useEffect, useState } from "react";
import { BlotterTable } from "@/desk/blotter-table";
import { when } from "@/desk/fmt";
import { Tip } from "@/desk/tip";
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
        <header className="panel-head">
          <Tip tip="Live paper option packages from Alpaca. Hover blotter headers for field meanings." below>
            Open positions
          </Tip>
        </header>
        <div className="panel-body" style={{ padding: 0 }}>
          <BlotterTable positions={desk?.positions ?? []} empty="None." />
        </div>
      </article>

      <article className="panel">
        <header className="panel-head">
          <Tip tip="Recent paper orders. pop-alpha-* client ids are from this agent." below>
            Recent orders
          </Tip>
        </header>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Status</th>
                <th>
                  <Tip tip="mleg for multi-leg packages." below>
                    Class
                  </Tip>
                </th>
                <th>Limit</th>
                <th>Fill</th>
                <th>
                  <Tip tip="Client order id — pop-alpha-* marks this agent." below>
                    Client id
                  </Tip>
                </th>
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
        <header className="panel-head">
          <Tip tip="Friday 28 Aug test book (X17N). Official P&L uses a new $100k account from Mon 31." below>
            Friday test book (does not score)
          </Tip>
        </header>
        <div className="panel-body">
          <pre className="door" style={{ whiteSpace: "pre-wrap", maxHeight: 360 }}>
            {desk?.testBook || "hackathon/TEST_BOOK.md"}
          </pre>
        </div>
      </article>
    </div>
  );
}
