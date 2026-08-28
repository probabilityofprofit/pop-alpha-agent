/**
 * POP Alpha Agent — authored 28 Aug 2026 (hackathon window).
 * Paper scan stub. Does not place until the governor and MCP door are wired.
 * Live Alpaca keys are out of scope; this process must not read them.
 */

const LIVE_KEY_NAMES = ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"] as const;

function assertPaperOnly(): void {
  for (const name of LIVE_KEY_NAMES) {
    if (process.env[name]) {
      throw new Error(`${name} is set. This agent is paper-only.`);
    }
  }
  if (process.env.ALPACA_PAPER_TRADE !== "true") {
    throw new Error("ALPACA_PAPER_TRADE must be true.");
  }
}

function main(): void {
  assertPaperOnly();
  const cycleId = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      kind: "cycle",
      cycleId,
      decision: "no_trade",
      thesis: "Stub scan. Governor + MCP door not wired yet. No order sent.",
    }),
  );
}

main();
