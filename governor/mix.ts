/** Mix caps by contest day. Authored 28 Aug 2026. */

import { ymd } from "./calendar";
import type { Template } from "./types";

/** Same day the book expands to 15%. */
export const MIX_EXPAND_YMD = "2026-09-02";
/** Tuesday: four per bucket (book 10% binds near ten packages). */
export const MIX_CAP = 4;
/** Wednesday onward: five per bucket so ~fifteen packages can sit. */
export const MIX_CAP_EXPANDED = 5;
export const MIX_CAP_REASON = "Mix cap: four bull, four bear, four irons.";
export const MIX_CAP_REASON_EXPANDED = "Mix cap: five bull, five bear, five irons.";

export function mixCap(asOf: Date = new Date()): number {
  return ymd(asOf) >= MIX_EXPAND_YMD ? MIX_CAP_EXPANDED : MIX_CAP;
}

export function mixCapReason(asOf: Date = new Date()): string {
  return ymd(asOf) >= MIX_EXPAND_YMD ? MIX_CAP_REASON_EXPANDED : MIX_CAP_REASON;
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
