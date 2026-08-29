"use client";

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
        POP by Friday {map.popAtManageBy.toFixed(1)}% · mean Friday P&amp;L {map.meanPnlAtManageBy.toFixed(0)}
        <span style={{ color: "var(--faint)" }}>
          {" "}
          · expiry {map.popAtExpiration.toFixed(1)}%
        </span>
      </p>
      <div className="hold">
        <div className="hold-head mono">
          <span>Day</span>
          {TARGETS.map((t) => (
            <span key={t}>{t}%</span>
          ))}
        </div>
        {shown.map((day) => (
          <div key={day} className="hold-row">
            <span className="mono" style={{ fontWeight: day === manageByDays ? 700 : 400, color: "var(--dim)" }}>
              {day}
              {day === manageByDays ? "*" : ""}
            </span>
            {TARGETS.map((t) => {
              const v = map.cells[day]?.[t] ?? 0;
              return (
                <span key={t} className="cell mono" style={{ background: tone(v) }}>
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
