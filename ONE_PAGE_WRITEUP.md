# One Page Write-Up

POP Alpha Agent · Alpaca × lablab Options Alpha Agents · Official book `CTM7`

We built a paper options agent that can run without someone babysitting every ticket. The model is allowed to have opinions. It is not allowed to touch the broker. Everything that matters — size, strikes, whether we trade at all — sits in a deterministic governor we wrote during the window.

## AI logic

The loop builds a liquid options tape from Alpaca’s most-active names and movers, then optionally asks an LLM for a small thesis JSON: underlying, structure, bias, and a sentence. That is the whole model contract. No quantity. No limit. No OCC symbols. If the JSON is missing or nonsense, we mark `modelSkip` and keep scanning — the governor does not need the model to work.

From that hint (or without it), the governor enumerates defined-risk templates on the tape: bull and bear call/put verticals, and early in the week iron condors and butterflies. It scores each candidate with a Monte Carlo hold map aimed at the contest mark — Friday 4 Sep 9:30 a.m. ET — not at far-away expiration. Probability of profit, mean mark P&L, and the chance of reaching 25% of max profit by that manage-by day are hard gates. Packages that clear are ranked, mostly by the Friday 50% cell. The winner becomes a proposal with qty, join-NBBO limit, and an MCP-shaped multi-leg payload. The desk freezes the last cleared proposal, hold map, and door JSON so judges still see a real ticket when the live scan is idle.

## Risk gates

Paper only. Fail closed. Size is `floor(1% of equity ÷ |max loss|)`, with an unattended lot cap so a bug cannot fire a forty-five lot. Concurrent book risk steps up through the week: 10% Tuesday, 15% Wednesday, 20% from Thursday, with matching equity floors at $90k / $85k / $80k (or a `HALT` file). Mix starts 4/4/4, then 5/5/5, then Thursday goes one-way: follow the green open sleeve, session-side verticals only, mix 20 on that side. One package per name. No new risk in the last fifteen minutes of the cash session, and none on Friday. Opens join NBBO as DAY orders; closes do the same. Take profit and stop are each 50% of the position’s defined max profit or risk, with a three-minute hold on stops so the first mid marks after a join do not look like a loss. After Friday’s 9:30 snapshot we flatten; until then the Thursday EOD book stays frozen on the Book tab for judging.

## Alpaca infrastructure

Reads go to `paper-api.alpaca.markets` and the data API: clock, account, positions, orders, chains, quotes, snapshots. The Alpha Desk is GET-only — it never places. Opens and closes leave through the same shape as Alpaca MCP `place_option_order` (mleg, DAY, limit). A human can paste that JSON into Cursor, or the unattended loop can POST it when `LOOP_SEND=true`. Live keys are never constructed. Indicative options data was enough for the week; we did not depend on OPRA. The official scored account is a fresh $100k paper book ending in `CTM7`, measured on total equity, not cash. Ledger, loop heartbeat, tape, and this cockpit are the exhibit of the workflow alongside the P&L.
