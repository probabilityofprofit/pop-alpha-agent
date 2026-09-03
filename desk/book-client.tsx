"use client";

import { useEffect, useState } from "react";
import { BlotterTable } from "@/desk/blotter-table";
import { money, when } from "@/desk/fmt";
import { Tip } from "@/desk/tip";
import type { DeskPayload } from "@/lib/desk-types";
import { groupPositionsForBlotter } from "@/lib/packages-from-positions";

export function BookClient() {
  const [desk, setDesk] = useState<DeskPayload | null>(null);

  useEffect(() => {
    void fetch("/api/desk", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: DeskPayload) => setDesk(j));
  }, []);

  const thursday = desk?.thursdayBook ?? null;
  const thursdayAsOf = thursday?.asOf ? new Date(thursday.asOf) : undefined;
  const openPackages = groupPositionsForBlotter(desk?.positions ?? []).length;
  const thursdayPackages =
    thursday?.packageCount ??
    (thursday ? groupPositionsForBlotter(thursday.positions, thursdayAsOf).length : 0);

  return (
    <div className="stack">
      {thursday ? (
        <article className="panel">
          <header className="panel-head">
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <Tip
                tip="Frozen post-Thursday-close book for judging. Survives Friday flatten. Never overwritten once saved."
                below
              >
                Thursday EOD book
              </Tip>
              <span
                className="mono"
                style={{ color: "var(--faint)", fontWeight: 500 }}
                data-tip="Packages frozen at capture."
                data-tip-pos="below"
              >
                ({thursdayPackages})
              </span>
              <span className="mono" style={{ color: "var(--dim)", fontWeight: 500, fontSize: 12 }}>
                equity {money(thursday.equity)} · {thursday.accountNumber.slice(-4)} · {when(thursday.asOf)}
              </span>
            </span>
          </header>
          <div className="panel-body" style={{ padding: 0 }}>
            <BlotterTable
              positions={thursday.positions}
              asOf={thursdayAsOf}
              empty="Thursday book file is empty."
            />
          </div>
        </article>
      ) : null}

      <article className="panel">
        <header className="panel-head">
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
            <Tip tip="Live paper option packages from Alpaca. Hover blotter headers for field meanings." below>
              Live open positions
            </Tip>
            <span
              className="mono"
              style={{ color: "var(--faint)", fontWeight: 500 }}
              data-tip="Number of open packages (grouped legs, not raw option lines)."
              data-tip-pos="below"
            >
              ({openPackages})
            </span>
          </span>
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
