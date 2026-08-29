"use client";

import { money, num, pct, pnlClass, strategyTitle } from "@/desk/fmt";
import { Tip } from "@/desk/tip";
import { groupPositionsForBlotter } from "@/lib/packages-from-positions";
import type { PaperPosition } from "@/lib/paper-broker";
import type { Template } from "@/governor/types";

function strategyTone(template: Template | null): string {
  if (!template) return "neutral";
  if (template.startsWith("bull")) return "bull";
  if (template.startsWith("bear")) return "bear";
  return "iron";
}

function netLabel(entryNet: number | null, credit: boolean | null): string {
  if (entryNet == null || credit == null) return "—";
  return `${num(entryNet)} ${credit ? "cr" : "db"}`;
}

export function BlotterTable({
  positions,
  empty = "No open paper positions, or keys not loaded.",
}: {
  positions: PaperPosition[];
  empty?: string;
}) {
  const groups = groupPositionsForBlotter(positions);
  return (
    <table className="data blotter">
      <thead>
        <tr>
          <th>
            <Tip tip="Inferred defined-risk package: bull/bear vertical or iron." below>
              Strategy
            </Tip>
          </th>
          <th>
            <Tip tip="Package expiration and calendar DTE." below>
              Expiry
            </Tip>
          </th>
          <th>
            <Tip tip="Entry net premium in points — credit (cr) or debit (db)." below>
              Net
            </Tip>
          </th>
          <th className="blotter-pkg-upl">
            <Tip tip="Sum of unrealized P&L across the package legs." below>
              Strategy UPL
            </Tip>
          </th>
          <th className="blotter-pkg-upl">
            <Tip tip="Strategy UPL as a percent of max profit. Take is ~50%." below>
              % Max
            </Tip>
          </th>
          <th className="blotter-symbol">
            <Tip tip="OCC option symbol for the leg." below>
              Symbol
            </Tip>
          </th>
          <th>
            <Tip tip="Side and quantity of this leg." below>
              Qty
            </Tip>
          </th>
          <th>
            <Tip tip="Average entry price for the leg." below>
              Entry
            </Tip>
          </th>
          <th>
            <Tip tip="Current mark from the paper account." below>
              Mark
            </Tip>
          </th>
          <th>
            <Tip tip="Unrealized P&L for this leg only." below>
              UPL
            </Tip>
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.flatMap((group) =>
          group.legs.map((p, i) => (
            <tr key={p.symbol}>
              {i === 0 ? (
                <>
                  <td
                    className={`blotter-strategy blotter-strategy-${strategyTone(group.template)}`}
                    rowSpan={group.legs.length}
                  >
                    <span className="blotter-strategy-rail" aria-hidden />
                    <span className="blotter-strategy-name">
                      {group.template ? strategyTitle(group.template) : "—"}
                    </span>
                  </td>
                  <td className="blotter-expiry" rowSpan={group.legs.length}>
                    {group.expiration ? (
                      <>
                        <span className="mono">{group.expiration}</span>
                        <span className="blotter-dte mono">
                          {group.dte != null ? `${group.dte} DTE` : ""}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="mono blotter-net" rowSpan={group.legs.length}>
                    {netLabel(group.entryNet, group.credit)}
                  </td>
                  <td className={`mono blotter-pkg-upl ${pnlClass(group.strategyUpl)}`} rowSpan={group.legs.length}>
                    {money(group.strategyUpl)}
                  </td>
                  <td
                    className={`mono blotter-pkg-upl ${pnlClass(group.pctOfMaxProfit)}`}
                    rowSpan={group.legs.length}
                  >
                    {pct(group.pctOfMaxProfit)}
                  </td>
                </>
              ) : null}
              <td className="mono blotter-symbol">{p.symbol}</td>
              <td className="mono">
                {p.side} {p.qty}
              </td>
              <td className="mono">{p.avg_entry_price}</td>
              <td className="mono">{p.current_price}</td>
              <td className={`mono ${pnlClass(Number(p.unrealized_pl))}`}>{money(p.unrealized_pl)}</td>
            </tr>
          )),
        )}
        {!groups.length ? (
          <tr>
            <td colSpan={10} style={{ paddingLeft: 10, color: "var(--dim)" }}>
              {empty}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
