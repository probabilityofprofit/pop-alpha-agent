/** Contest clocks for the Alpha Desk. Authored 29 Aug 2026. No broker I/O. */

import { ymd } from "../governor/calendar";

/** 9:30 a.m. ET is 13:30 UTC while the window is on EDT. */
export function et930(day: string): number {
  return Date.parse(`${day}T13:30:00.000Z`);
}

export const HACKATHON_OPEN = et930("2026-08-28");
export const OFFICIAL_OPEN = et930("2026-08-31");
export const SNAPSHOT = et930("2026-09-04");

export type ContestPhase = "build" | "official" | "closed";

export type ContestEvent = {
  id: string;
  at: number;
  when: string;
  title: string;
  body: string;
  tag: string;
};

export type WeekDay = {
  ymd: string;
  dow: string;
  day: string;
  tag: string;
  tone: "test" | "build" | "official" | "mark";
};

export const WEEK: WeekDay[] = [
  { ymd: "2026-08-28", dow: "Fri", day: "28", tag: "Test book", tone: "test" },
  { ymd: "2026-08-29", dow: "Sat", day: "29", tag: "Build", tone: "build" },
  { ymd: "2026-08-30", dow: "Sun", day: "30", tag: "Build", tone: "build" },
  { ymd: "2026-08-31", dow: "Mon", day: "31", tag: "Official", tone: "official" },
  { ymd: "2026-09-01", dow: "Tue", day: "1", tag: "Official", tone: "official" },
  { ymd: "2026-09-02", dow: "Wed", day: "2", tag: "Official", tone: "official" },
  { ymd: "2026-09-03", dow: "Thu", day: "3", tag: "EOD mark", tone: "mark" },
  { ymd: "2026-09-04", dow: "Fri", day: "4", tag: "Snapshot", tone: "mark" },
];

export const CONTEST_EVENTS: ContestEvent[] = [
  {
    id: "kickoff",
    at: HACKATHON_OPEN,
    when: "Fri 28 Aug · 9:30 a.m. ET",
    title: "Hackathon kicks off",
    body: "Alpaca × LabLab Options Alpha Agents. Seven days to build an autonomous options agent. A UI is optional; the workflow is what they read.",
    tag: "Build",
  },
  {
    id: "test-book",
    at: HACKATHON_OPEN + 60 * 60 * 1000,
    when: "Fri 28 Aug session",
    title: "Test book only — does not score",
    body: "You may paper-trade a testing account (this desk’s Friday book ends X17N). Those fills are for wiring MCP and the loop. They do not count toward official P&L.",
    tag: "Test",
  },
  {
    id: "weekend",
    at: et930("2026-08-29"),
    when: "Sat 29 – Sun 30 Aug",
    title: "Build weekend",
    body: "Keep testing on the old book. Open a new $100k paper account for Monday. Same email is allowed. Do not send official risk until the cash open Monday.",
    tag: "Build",
  },
  {
    id: "official-open",
    at: OFFICIAL_OPEN,
    when: "Mon 31 Aug · 9:30 a.m. ET",
    title: "Official clock starts",
    body: "First scored order. New $100k paper, options on, not the Friday test book. Alpaca measures total equity, not cash. This agent sizes 1% tickets into a 10% book.",
    tag: "Official",
  },
  {
    id: "sessions",
    at: et930("2026-09-01"),
    when: "Tue 1 – Wed 2 Sep",
    title: "Trade the open, mark the book",
    body: "Tue: 10% book (~ten packages), mix 4/4/4. From Wed: 15% book (~fifteen), mix 5/5/5; halt $85k. One package per name. Fast tape 9:30–10:30 a.m. ET, then every 15 minutes. Last 15 minutes of RTH: no new risk.",
    tag: "Official",
  },
  {
    id: "thursday",
    at: et930("2026-09-03"),
    when: "Thu 3 Sep · cash session",
    title: "Last full day for new risk",
    body: "Thursday 0DTE is allowed. Assignment on Sep 3 expiries is in Alpaca’s Thursday EOD figure. After 12:45 p.m. PDT, cancel working DAY opens. Do not flatten the book tonight.",
    tag: "Official",
  },
  {
    id: "thursday-eod",
    at: Date.parse("2026-09-03T20:00:00.000Z"),
    when: "Thu 3 Sep · EOD",
    title: "Thursday equity mark",
    body: "Alpaca looks at total equity at Thursday’s close, including Sep 3 exercise and assignment. Leave defined-risk packages on through the Friday morning snapshot.",
    tag: "Mark",
  },
  {
    id: "snapshot",
    at: SNAPSHOT,
    when: "Fri 4 Sep · 9:30 a.m. ET",
    title: "Official snapshot, then flatten",
    body: "Photograph total equity. Dollar P&L is that number minus $100,000. Flatten after the snapshot — not before. Trading after 9:30 a.m. ET does not score.",
    tag: "Mark",
  },
  {
    id: "judges",
    at: SNAPSHOT + 60 * 1000,
    when: "After the snapshot",
    title: "Judges read equity and the workflow",
    body: "Winners are not P&L alone. They also score creativity, autonomy, and robustness. Ledger, loop heartbeat, and hold maps on this desk are the exhibit.",
    tag: "Judges",
  },
];

export function contestPhase(asOf: Date): ContestPhase {
  const t = asOf.getTime();
  if (t >= SNAPSHOT) return "closed";
  if (t >= OFFICIAL_OPEN) return "official";
  return "build";
}

export function contestAnchor(asOf: Date): { label: string; at: number } {
  const t = asOf.getTime();
  if (t < OFFICIAL_OPEN) return { label: "Official book opens", at: OFFICIAL_OPEN };
  if (t < SNAPSHOT) return { label: "Snapshot", at: SNAPSHOT };
  return { label: "Window closed", at: SNAPSHOT };
}

export function remainingLabel(asOf: Date, target: number): string {
  const ms = target - asOf.getTime();
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  if (days >= 1) return `${days}d ${h}h`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

export function eventState(at: number, asOf: Date, nextAt?: number): "past" | "now" | "next" {
  const t = asOf.getTime();
  if (nextAt != null && t >= at && t < nextAt) return "now";
  if (nextAt == null && t >= at) return "now";
  if (t >= at) return "past";
  return "next";
}

export function todayYmd(asOf: Date): string {
  return ymd(asOf);
}

export type HistoryRow = { hash: string; date: string; title: string };

/** Used when git is not on the dyno. Keep in date order. */
export const HISTORY_FALLBACK: HistoryRow[] = [
  { hash: "fcf25e5", date: "2026-08-28", title: "Start the in-window options-alpha agent." },
  { hash: "b44a909", date: "2026-08-28", title: "Add paper size/strike helpers and log the Friday MCP mleg fill." },
  { hash: "7840c74", date: "2026-08-28", title: "Implement the governor kernel: tape, six templates, hold map, pick, MCP door." },
  { hash: "7a6c785", date: "2026-08-28", title: "Add the in-window Alpha Desk so judges can watch proposals, vetoes, and paper P&L." },
  { hash: "33e1402", date: "2026-08-28", title: "Add the RTH loop so the governor can mark exits and scan tape without placing orders." },
  { hash: "4291058", date: "2026-08-28", title: "Update README to remove prior work section." },
  { hash: "49b9c64", date: "2026-08-28", title: "Ledger every loop decision including no-trade, and add an opt-in paper door that can send without a paste." },
  { hash: "7815663", date: "2026-08-28", title: "Size the official week at 10% book, 90k halt, and 5 session opens with a 2/2/2 mix." },
  { hash: "b7bc582", date: "2026-08-29", title: "Score packages to the Friday mark, search 0–21 DTE, and scan every 2.5 minutes in the opening hour." },
  { hash: "a296f47", date: "2026-08-29", title: "Group the paper blotter by strategy with package UPL, net, expiry, and percent of max." },
  { hash: "43e8ab6", date: "2026-08-29", title: "Add a Risk sidebar page that lists the live governor gates." },
];
