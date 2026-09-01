import { MAX_DTE, MIN_DTE, WINDOW_END } from "@/governor/calendar";
import { MIX_CAP, MIX_CAP_EXPANDED } from "@/governor/mix";
import { STOP_HOLD_MS } from "@/lib/closer";
import {
  BOOK_CAP,
  BOOK_CAP_EXPANDED,
  DEFAULT_MAX_QTY,
  EQUITY_FLOOR,
  EQUITY_FLOOR_EXPANDED,
  OPEN_SCAN_EVERY_MS,
  SCAN_EVERY_MS,
} from "@/lib/loop-policy";

const ROWS: Array<{ label: string; value: string; note?: string }> = [
  {
    label: "Ticket size",
    value: "1% of equity / |max loss|",
    note: "Qty = floor(0.01 × equity ÷ package max loss).",
  },
  {
    label: "Fat-finger qty cap",
    value: `${DEFAULT_MAX_QTY} lots`,
    note: "LOOP_MAX_QTY default. Does not replace 1% sizing.",
  },
  {
    label: "Book cap",
    value: `${Math.round(BOOK_CAP * 100)}% Tue · ${Math.round(BOOK_CAP_EXPANDED * 100)}% from Wed`,
    note: "Sum of open defined-risk |max loss| × qty. ~10 packages today, ~15 from Wednesday.",
  },
  {
    label: "Equity halt",
    value: `≤ $${EQUITY_FLOOR.toLocaleString("en-US")} Tue · $${EQUITY_FLOOR_EXPANDED.toLocaleString("en-US")} from Wed`,
    note: "Or hackathon/HALT file. Flattening still allowed. Paired with the live book hole.",
  },
  {
    label: "Mix",
    value: `${MIX_CAP}/${MIX_CAP}/${MIX_CAP} Tue · ${MIX_CAP_EXPANDED}/${MIX_CAP_EXPANDED}/${MIX_CAP_EXPANDED} from Wed`,
    note: "Bull / bear / iron. Open books and working DAY mlegs count.",
  },
  {
    label: "Tenor",
    value: `${MIN_DTE}–${MAX_DTE} DTE`,
    note: `All expiries through ${WINDOW_END}; plus ~7/14/21 after that.`,
  },
  {
    label: "Structures",
    value: "Defined-risk verticals & irons only",
    note: "Unlimited loss is a hard veto. DAY limit, join NBBO.",
  },
  {
    label: "Take / stop",
    value: "50% of position max profit / 50% of position risk",
    note: `Per-lot × qty. No stop for ${STOP_HOLD_MS / 60_000} min after fill. No same-name re-entry after a stop.`,
  },
  {
    label: "Hold-map gates",
    value: "Friday mark POP ≥ 35, mean ≥ 0, 25% cell ≥ 25",
    note: "Expiry POP does not pass a package. Rank uses Friday 50% cell.",
  },
  {
    label: "Scan cadence",
    value: `${OPEN_SCAN_EVERY_MS / 60_000} min open hour · ${SCAN_EVERY_MS / 60_000} min after`,
    note: "9:30–10:30 a.m. ET fast tape; then 15 minutes.",
  },
  {
    label: "Clock cuts",
    value: "No new risk last 15 min RTH · none Fri 4 Sep",
    note: "Cancel working DAY opens at scan end and at 12:45 p.m. PDT.",
  },
  {
    label: "Door",
    value: "Paper only · model never places",
    note: "LOOP_SEND paper door or Cursor MCP place_option_order.",
  },
];

export default function RiskPage() {
  return (
    <article className="panel policy risk">
      <header className="panel-head" data-tip="Hard gates from loop-policy / mix / pick — not suggestions." data-tip-pos="below">
        Risk settings
      </header>
      <div className="panel-body">
        <p>
          Live constants from the governor. These are the hard gates on size, book, halt, mix, and
          the Friday mark — not suggestions.
        </p>
        <table className="data risk-table">
          <thead>
            <tr>
              <th data-tip="Governor gate name." data-tip-pos="below">
                Gate
              </th>
              <th data-tip="Value the live loop enforces." data-tip-pos="below">
                Setting
              </th>
              <th data-tip="How the gate is applied." data-tip-pos="below">
                Detail
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="mono">{row.value}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 14, color: "var(--faint)", fontSize: 12 }}>
          Source of truth: <span className="mono">GOVERNOR.md</span>,{" "}
          <span className="mono">lib/closer.ts</span>,{" "}
          <span className="mono">lib/loop-policy.ts</span>, <span className="mono">governor/mix.ts</span>,{" "}
          <span className="mono">governor/pick.ts</span>.
        </p>
      </div>
    </article>
  );
}
