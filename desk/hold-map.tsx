"use client";

import { Tip } from "@/desk/tip";
import type { HoldMap } from "@/governor/types";

const TARGETS = [25, 50, 75, 100] as const;

function tone(v: number): string {
  const t = Math.max(0, Math.min(100, v));
  return `color-mix(in oklab, var(--up) ${Math.round(t * 0.55)}%, var(--surface-3))`;
}

export function HoldMapGrid({ map, manageByDays }: { map: HoldMap; manageByDays: number }) {
  const days = Object.keys(map.cells)
    .map(Number)
    .sort((a, b) => a - b);
  const step = days.length > 16 ? 2 : 1;
  const shown = days.filter((d, i) => d === manageByDays || d === days[days.length - 1] || i % step === 0);
  return (
    <div>
      <p className="mono" style={{ marginTop: 0, color: "var(--ink)" }}>
        <Tip tip="Probability of profit on the Friday / manage-by mark. Gate requires ≥ 35.">
          POP by Friday {map.popAtManageBy.toFixed(1)}%
        </Tip>
        {" · "}
        <Tip tip="Mean mark P&L on the manage-by day across trials. Gate requires ≥ 0.">
          mean Friday P&amp;L {map.meanPnlAtManageBy.toFixed(0)}
        </Tip>
        <span style={{ color: "var(--faint)" }}>
          {" "}
          ·{" "}
          <Tip tip="Expiry POP is shown for eyes only — it does not pass or rank a package.">
            expiry {map.popAtExpiration.toFixed(1)}%
          </Tip>
        </span>
      </p>
      <div className="hold">
        <div className="hold-head mono">
          <span>Day</span>
          {TARGETS.map((t) => (
            <Tip key={t} tip={`Share of paths that have reached ${t}% of max profit by that day.`}>
              <span>{t}%</span>
            </Tip>
          ))}
        </div>
        {shown.map((day) => (
          <div key={day} className="hold-row">
            <span
              className="mono"
              data-tip={
                day === manageByDays
                  ? "Manage-by day vs the Fri 4 Sep window. Contest gates read this row."
                  : `Hold day ${day} after entry.`
              }
              style={{ fontWeight: day === manageByDays ? 700 : 400, color: "var(--dim)" }}
            >
              {day}
              {day === manageByDays ? "*" : ""}
            </span>
            {TARGETS.map((t) => {
              const v = map.cells[day]?.[t] ?? 0;
              return (
                <span
                  key={t}
                  className="cell mono"
                  data-tip={`P(reach ${t}% of max profit by day ${day}) ≈ ${v.toFixed(0)}%.`}
                  style={{ background: tone(v) }}
                >
                  {v.toFixed(0)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p style={{ color: "var(--faint)", fontSize: 11, marginTop: 8 }}>* manage-by day vs the 4 Sep window</p>
    </div>
  );
}
