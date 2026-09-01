/** 4/4/4 mix: four bull verticals, four bear verticals, four irons. Authored 28 Aug 2026. */

import type { Template } from "./types";

/** Per-bucket ceiling so two cash sessions of five opens can sit together. 10% book is the money cap. */
export const MIX_CAP = 4;
export const MIX_CAP_REASON = "Mix cap: four bull, four bear, four irons.";

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
