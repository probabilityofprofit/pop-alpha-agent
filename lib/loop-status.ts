import { readFileSync } from "node:fs";
import type { LastLoop } from "./desk-types";
import { LOOP_STATUS_PATH } from "./paths";

export function loadLoopStatus(): LastLoop | null {
  try {
    return JSON.parse(readFileSync(LOOP_STATUS_PATH, "utf8")) as LastLoop;
  } catch {
    return null;
  }
}
