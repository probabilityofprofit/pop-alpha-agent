# Governor

Authored 28 Aug 2026 during the Alpaca Options Alpha Agents window. Paper-only. Fail closed.

**Test book (Fri 28 Aug):** existing paper account ending `X17N`. MCP mleg tests only. Does not score.

**Official book:** new Alpaca paper account, $100,000, options on. First order no earlier than **Mon 31 Aug 2026 9:30 a.m. ET**. Last four: `____`. Do not use the Friday test book (`X17N`) for this number.

Alpaca judges **total account equity**, not cash. Official window: **Mon 31 Aug 2026 9:30 a.m. ET → Fri 4 Sep 2026 9:30 a.m. ET**. They look at **Thursday 3 Sep EOD equity** (Sep 3 expiries’ exercise/assignment included) and take a **Friday 4 Sep 9:30 a.m. ET** equity snapshot. Dollar P&L = that equity − $100,000. Photograph Friday 9:30, **then** flatten — do not flatten before the snapshot. P&L is one judging factor; workflow (autonomy, robustness) also counts.

Halt file: `hackathon/HALT`. If it exists, or equity ≤ $90,000, no new risk. Flattening is allowed. The $90k floor is the same hole as the 10% book cap.

## Who owns what

| Decision | Owner | Must not |
| --- | --- | --- |
| Optional thesis JSON | Model | Place orders, pick qty, limit, strikes, or tenor |
| Tape, strikes, template, expiry, qty, limit, allow/veto | Governor | Skip the hold map |
| Open / close / cancel | MCP or `LOOP_SEND` paper door | Live keys, the model calling either, market mleg |
| Dollar P&L | Alpaca official paper account | Test-book fills or invented marks |

## 1. Venue, door, clock, halt

Paper only. `ALPACA_PAPER_TRADE=true`. Never construct a live Alpaca client or read live `ALPACA_API_KEY` / `ALPACA_SECRET_KEY`.

Opens: MCP `place_option_order` mleg, or the loop paper door posting that same payload when `LOOP_SEND=true`. Closes: same, then `close_position` per leftover OCC after two rejected mleg closes (`legwiseClose`). The model never calls either.

New risk only when `get_clock.is_open`. No queue for the next open. No new opens in the last 15 minutes of the cash session (after 12:45 p.m. PDT). Cancel working DAY opens then. Exit polls still run.

## 2. Tape

Each scan:

1. `get_most_active_stocks` volume top 30.
2. Union `get_market_movers` stocks top 10.
3. Drop crypto, OTC, halted, last < $10, names with an open or working package.
4. Drop corp actions (div/split/merger/spinoff) in the next 21 calendar days.
5. Drop **new credits** on event week: news in 36 hours matching earnings/EPS, or IV term ≤ 0.90. Debits may still score.
6. Keep names with some 7–21 DTE expiry that has contract volume ≥ 1,000 and OI ≥ 500 on short-leg candidates.
7. Rank by that window’s option volume. Max 15 names.
8. Keep SPY and QQQ if they pass leg liquidity, unless they fail 4–5 or already have a package.

Ignore a model ticker that is not on the tape.

Tenor: 7–21 calendar DTE, one expiry per ticket, no 0DTE. If more than three expiries in the window, score those closest to 7, 14, and 21 DTE.

## 3. Templates and strikes

Defined-risk only. Map:

| structure | bias | template | debit/credit |
| --- | --- | --- | --- |
| call_vertical | bull | bull call spread | debit |
| call_vertical | bear | bear call spread | credit |
| put_vertical | bull | bull put spread | credit |
| put_vertical | bear | bear put spread | debit |
| iron_condor | any | iron condor | credit |
| iron_butterfly | any | iron butterfly | credit |

Verticals: 2 legs. Irons: 4. Max loss must be finite and negative per 1× package. Unlimited loss is a veto. Skip an iron when one lot exceeds the size cap; still score verticals.

**Strikes (this repo’s builder, written this week):** ATM = listed strike nearest spot. Credits: short near ATM, long two listed strikes further OTM. Debits: long near ATM, short two listed strikes further OTM. Irons: 25-delta OTM wings when listed deltas exist, else two/four strike offsets. If a package fails liquidity, retry one extra OTM step, then one extra width step. Stop. Discard model OCC symbols.

**Leg liquidity.** Bid and ask; width ≤ max($0.20, 10% of mid); OI ≥ 200; mid ≥ $0.15.

Enumerate every legal template that still fits size/book. Score model hint first, then a vol/skew nudge (rich IV → credits/irons; cheap IV → debit verticals; movers gainers → bull first), then the rest. Winner is the hold-map rank, not the nudge.

## 4. Score and pick

Monte Carlo hold map, 1500 trials, rate 0.05, day step 1, targets 25/50/75/100. Volatility = average listed IV of the legs; skip if any required IV is missing. Do not gate on a path-to-target “pop” scalar.

Keep a candidate only if:

- Probability of profit at expiration ≥ 35 and mean P&L ≥ 0
- P(reach 50% of max profit by expiry) ≥ 40
- P(reach 25% of max profit by manage-by) ≥ 25
- manage-by days = min(DTE, calendar days to 2026-09-04), at least 1

Rank by manage-by 50% cell, then expiry 50% cell, then fewer DTE, then vertical over iron. Select `(underlying, template, expiration)`. Log overrides when the model loses. None pass → no-trade.

## 5. Size, book, limit

Qty = floor(1% of equity / |maxLoss|). Strip model qty. Skip if qty < 1.

Open defined-risk |maxLoss|×qty ≤ 10% of equity. One package per name. At most two bull verticals, two bear verticals, two irons (loop enforces this before send). A working open counts as that name’s package. Unattended qty is also capped at 12 lots (`LOOP_MAX_QTY`, default 12) so a units bug cannot send a 45-lot.

DAY only. Join net NBBO: debit at net ask, credit at net bid. Do not cross. Closes: buying back a credit uses net ask; selling a debit uses net bid.

## 6. Cycle

Scan every 15 minutes in the cash session. 4-minute wall; if time expires, pick among maps already finished. One new open per scan, five per session, one working DAY open. Cancel unfilled at scan end and at the last-15-minutes cutoff.

Exit poll every 60 seconds while anything is open: marks only, no Monte Carlo.

## 7. Closer

Take profit at 50% of max profit. Stop at 50% of |maxLoss| (credits) or 50% of debit paid (debits). Mark = package net mid vs filled entry.

No new official risk after Thursday 3 Sep last 15 minutes, and none on Friday 4 Sep. Thursday EOD marks plus Sep 3 assignment are what Alpaca described as the scored book. Leave packages on through the **Friday 4 Sep 9:30 a.m. ET** snapshot, then flatten. Do not flatten Thursday night or Friday before 9:30 a.m. ET.

Close path: mleg `place_option_order`, one retry, then `close_position`. Leftover after two attempts: halt file. Assignment: flatten the rest of the package.

## 8. Model contract

The only JSON the LLM should emit:

```json
{
  "action": "propose",
  "underlying": "SPY",
  "structure": "put_vertical",
  "bias": "bull",
  "expiration": "2026-09-11",
  "thesis": "Credit put vertical. Hold map vs 4 Sep 9:30 ET window."
}
```

No qty, limit, or OCC. Missing or bad JSON → `modelSkip`; the scan still runs.

## 9. Ledger and contest close

Append `hackathon/ledger.jsonl`: `cycle` (one final or idle row per tick, including no-trade), `score` (per expiry), `order`, `fill`, `cancel`, `exit`, `halt`. No secrets. `order` is written when the door sends. Fills are reconciled from paper orders with `pop-alpha-*` client ids.

Friday 4 Sep 9:30 a.m. ET: `CONTEST.md` / `CONTEST.json` from MCP account, history, activities, orders, positions on the **official** account. Dollar P&L = official **equity** − $100,000 (not cash). Screenshot must match that Friday 9:30 equity. Then flatten.

## Allow / deny

Allow: bull/bear call and put verticals, iron condor, iron butterfly, explicit no-trade, scan with modelSkip.

Deny: naked shorts, unlimited-loss straddles/strangles/ratios, stock, crypto, single-leg, calendars, diagonals, off-tape names, second package in a name, live trading, market mleg, model qty/limit/OCC, invented P&L, holding a working DAY into the next scan or into the last 15 minutes of RTH, a send path that is not the MCP-shaped paper door.
