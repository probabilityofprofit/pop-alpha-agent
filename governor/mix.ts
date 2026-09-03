/** Mix caps by contest day. Authored 28 Aug 2026. */

import { ymd } from "./calendar";
import type { Template } from "./types";

/** Same day the book expands to 15%. */
export const MIX_EXPAND_YMD = "2026-09-02";
/** Same day the book expands to 20%. */
export const MIX_EXPAND_THU_YMD = "2026-09-03";
/** Tuesday: four per bucket (book 10% binds near ten packages). */
export const MIX_CAP = 4;
/** Wednesday: five per bucket so ~fifteen packages can sit. */
export const MIX_CAP_EXPANDED = 5;
/** Thursday one-way: session-side verticals only so the 20% book can stack. */
export const MIX_CAP_THURSDAY = 20;
export const MIX_CAP_REASON = "Mix cap: four bull, four bear, four irons.";
export const MIX_CAP_REASON_EXPANDED = "Mix cap: five bull, five bear, five irons.";
export const MIX_CAP_REASON_THURSDAY = "Thursday: new risk follows profitable open verticals.";

export const BULL_TEMPLATES: Template[] = ["bull_put", "bull_call"];
export const BEAR_TEMPLATES: Template[] = ["bear_call", "bear_put"];

export function sideTemplates(side: "up" | "down"): Template[] {
  return side === "up" ? BULL_TEMPLATES : BEAR_TEMPLATES;
}

export function mixCap(asOf: Date = new Date()): number {
  const day = ymd(asOf);
  if (day >= MIX_EXPAND_THU_YMD) return MIX_CAP_THURSDAY;
  if (day >= MIX_EXPAND_YMD) return MIX_CAP_EXPANDED;
  return MIX_CAP;
}

export function mixCapReason(asOf: Date = new Date()): string {
  const day = ymd(asOf);
  if (day >= MIX_EXPAND_THU_YMD) return MIX_CAP_REASON_THURSDAY;
  if (day >= MIX_EXPAND_YMD) return MIX_CAP_REASON_EXPANDED;
  return MIX_CAP_REASON;
}

export type MixBucket = "bull" | "bear" | "iron";
export type MixCounts = Record<MixBucket, number>;

export function mixBucket(template: Template): MixBucket {
  if (template.startsWith("iron")) return "iron";
  if (template.startsWith("bull")) return "bull";
  return "bear";
}

export function emptyMix(): MixCounts {
  return { bull: 0, bear: 0, iron: 0 };
}

export function mixCounts(templates: Iterable<Template>): MixCounts {
  const counts = emptyMix();
  for (const template of templates) counts[mixBucket(template)] += 1;
  return counts;
}

export function mixAllows(counts: MixCounts, template: Template, cap = MIX_CAP): boolean {
  return counts[mixBucket(template)] < cap;
}

export function allowedTemplates(counts: MixCounts, all: Template[], cap = MIX_CAP): Template[] {
  return all.filter((template) => mixAllows(counts, template, cap));
}
