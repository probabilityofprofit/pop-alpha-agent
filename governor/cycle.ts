/** One scan: build templates, score, pick. Authored 28 Aug 2026. */

import { lastFifteenMinutesPdt } from "./calendar";
import { openMleg } from "./door";
import { appendLedger } from "./ledger";
import { MIX_CAP_REASON } from "./mix";
import { rank, scorePackage, toDecision } from "./pick";
import { ALL_TEMPLATES, buildTemplate } from "./strikes";
import type { Decision, OccQuote, Template } from "./types";

export type ScanInput = {
  underlying: string;
  expiration: string;
  dte: number;
  spot: number;
  equity: number;
  quotes: OccQuote[];
  asOf: Date;
  isOpen: boolean;
  halt: boolean;
  cycleId: string;
  ledgerPath?: string;
  preferred?: Template[];
  /** If set, only these templates may win (mix cap). */
  allowedTemplates?: Template[];
};

export function scanExpiry(input: ScanInput): Decision {
  if (input.halt) return { action: "no_trade", reason: "Halt file or equity floor." };
  if (!input.isOpen) return { action: "no_trade", reason: "Cash session closed." };
  if (lastFifteenMinutesPdt(input.asOf)) return { action: "no_trade", reason: "Last 15 minutes of RTH." };

  const base = input.preferred?.length
    ? [...input.preferred, ...ALL_TEMPLATES.filter((t) => !input.preferred!.includes(t))]
    : ALL_TEMPLATES;
  const order = input.allowedTemplates ? base.filter((t) => input.allowedTemplates!.includes(t)) : base;
  if (!order.length) return { action: "no_trade", reason: MIX_CAP_REASON };
  const scored = [];
  for (const template of order) {
    for (const extra of [0, 1]) {
      const pkg = buildTemplate(template, input.quotes, input.spot, input.underlying, input.expiration, input.dte, extra);
      if (!pkg) continue;
      const row = scorePackage(pkg, input.spot, input.equity, input.asOf);
      if (row) {
        scored.push(row);
        break;
      }
    }
  }
  scored.sort(rank);
  const decision = toDecision(scored[0]);
  if (input.ledgerPath) {
    appendLedger(input.ledgerPath, {
      ts: input.asOf.toISOString(),
      kind: "score",
      cycleId: input.cycleId,
      underlying: input.underlying,
      expiration: input.expiration,
      decision: decision.action,
      reason: decision.action === "no_trade" ? decision.reason : undefined,
      template: decision.action === "propose" ? decision.package.template : undefined,
      qty: decision.action === "propose" ? decision.qty : undefined,
      limit: decision.action === "propose" ? decision.limit : undefined,
      popAtExpiration: decision.action === "propose" ? decision.map.popAtExpiration : undefined,
      popAtManageBy: decision.action === "propose" ? decision.map.popAtManageBy : undefined,
      meanPnl: decision.action === "propose" ? decision.map.meanPnlAtManageBy : undefined,
      manageByDays: decision.action === "propose" ? decision.manageByDays : undefined,
    });
  }
  return decision;
}

export function mcpPayload(decision: Decision, cycleId: string) {
  if (decision.action !== "propose") return null;
  return openMleg(decision.package, decision.qty, decision.limit, `pop-alpha-${cycleId}`);
}
