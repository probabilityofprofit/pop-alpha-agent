/** Optional thesis LLM. Authored 28 Aug 2026. Never places. Bad JSON → modelSkip. */

import type { Template } from "../governor/types";

export type ThesisHint = {
  action: "propose";
  underlying: string;
  structure: "call_vertical" | "put_vertical" | "iron_condor" | "iron_butterfly";
  bias: "bull" | "bear" | "any";
  expiration?: string;
  thesis?: string;
};

export type ThesisResult =
  | { skip: true; reason: string }
  | { skip: false; hint: ThesisHint; preferred: Template[] };

const STRUCTURES = new Set(["call_vertical", "put_vertical", "iron_condor", "iron_butterfly"]);
const BIASES = new Set(["bull", "bear", "any"]);

export function parseThesis(raw: unknown): ThesisResult {
  if (typeof raw === "string") {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        raw = JSON.parse(raw.slice(start, end + 1));
      } catch {
        return { skip: true, reason: "modelSkip: model did not return JSON." };
      }
    }
  }
  if (!raw || typeof raw !== "object") return { skip: true, reason: "modelSkip: empty JSON." };
  const row = raw as Record<string, unknown>;
  if (row.action != null && row.action !== "propose") return { skip: true, reason: "modelSkip: action is not propose." };
  const underlying = typeof row.underlying === "string" ? row.underlying.toUpperCase().trim() : "";
  const structure = typeof row.structure === "string" ? row.structure : "";
  const bias = typeof row.bias === "string" ? row.bias : "";
  if (!underlying || !STRUCTURES.has(structure) || !BIASES.has(bias)) {
    return { skip: true, reason: "modelSkip: underlying/structure/bias invalid." };
  }
  if ("qty" in row || "limit" in row || "occ" in row || "legs" in row) {
    return { skip: true, reason: "modelSkip: model sent qty/limit/OCC." };
  }
  const hint: ThesisHint = {
    action: "propose",
    underlying,
    structure: structure as ThesisHint["structure"],
    bias: bias as ThesisHint["bias"],
    expiration: typeof row.expiration === "string" ? row.expiration : undefined,
    thesis: typeof row.thesis === "string" ? row.thesis : undefined,
  };
  return { skip: false, hint, preferred: templatesFor(hint) };
}

export function templatesFor(hint: ThesisHint): Template[] {
  if (hint.structure === "put_vertical") return hint.bias === "bear" ? ["bear_put"] : ["bull_put"];
  if (hint.structure === "call_vertical") return hint.bias === "bear" ? ["bear_call"] : ["bull_call"];
  if (hint.structure === "iron_butterfly") return ["iron_fly"];
  return ["iron_condor"];
}

export async function fetchThesis(tape: string[], env: NodeJS.ProcessEnv = process.env): Promise<ThesisResult> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return { skip: true, reason: "modelSkip: OPENAI_API_KEY not set." };
  const model = env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const body = {
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Reply with one JSON object only, exactly like {"action":"propose","underlying":"SPY","structure":"put_vertical","bias":"bull","expiration":"2026-09-11","thesis":"..."}. action must be propose. underlying must be on the tape. structure is call_vertical, put_vertical, iron_condor, or iron_butterfly. bias is bull, bear, or any. No qty, limit, OCC, or legs.',
      },
      {
        role: "user",
        content: `Tape: ${tape.join(", ") || "(empty)"}. Contest window ends 2026-09-04 9:30 ET. Prefer 0-21 DTE defined-risk. Same-day and weeklies that settle by 4 Sep are in play.`,
      },
    ],
  };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { skip: true, reason: `modelSkip: OpenAI HTTP ${res.status}.` };
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    try {
      return parseThesis(JSON.parse(text));
    } catch {
      return { skip: true, reason: "modelSkip: model did not return JSON." };
    }
  } catch {
    return { skip: true, reason: "modelSkip: OpenAI request failed." };
  } finally {
    clearTimeout(t);
  }
}
