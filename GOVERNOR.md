# Governor

Authored 28 Aug 2026 during the Alpaca Options Alpha Agents window. Paper-only. Fail closed.

**Test book (Fri 28 Aug):** existing paper account ending `X17N`. MCP mleg tests only. Does not score.

**Official book:** new Alpaca paper account, $100,000, options on. First order no earlier than **Mon 31 Aug 2026 9:30 a.m. ET**. Last four: `CTM7`. Do not use the Friday test book (`X17N`) or the earlier Monday books (`YBLH`) for this number.

Alpaca judges **total account equity**, not cash. Official window: **Mon 31 Aug 2026 9:30 a.m. ET → Fri 4 Sep 2026 9:30 a.m. ET**. They look at **Thursday 3 Sep EOD equity** (Sep 3 expiries’ exercise/assignment included) and take a **Friday 4 Sep 9:30 a.m. ET** equity snapshot. Dollar P&L = that equity − $100,000. Photograph Friday 9:30, **then** flatten — do not flatten before the snapshot. P&L is one judging factor; workflow (autonomy, robustness) also counts.

Halt file: `hackathon/HALT`. If it exists, or equity ≤ the live floor (**$90k Tue**, **$85k Wed**, **$80k from Thu**), no new risk. Flattening is allowed. The floor is the same hole as the live book cap.

## Who owns what

| Decision | Owner | Must not |
| --- | --- | --- |
| Optional thesis JSON | Model | Place orders, pick qty, limit, strikes, or tenor |
| Tape, strikes, template, expiry, qty, limit, allow/veto | Governor | Skip the hold map |
| Open / close / cancel | MCP or `LOOP_SEND` paper door | Live keys, the model calling either, market mleg |
| Dollar P&L | Alpaca official paper account | Test-book fills or invented marks |

## 1. Venue, door, clock, halt

Paper only. `ALPACA_PAPER_TRADE=true`. Never construct a live Alpaca client or read live `ALPACA_API_KEY` / `ALPACA_SECRET_KEY`.

Opens: MCP `place_option_order` mleg, or the loop paper door posting that same payload when `LOOP_SEND=true`. Closes: same join-NBBO DAY mleg; do not restack while one is working. If join walks through the working limit, cancel and replace next tick. Qty-lock rejects do not halt. Two true mleg rejects then `close_position` per leftover OCC (`legwiseClose`). Leftover with no working order writes the halt file. The model never calls either.

New risk only when `get_clock.is_open`. No queue for the next open. No new opens in the last 15 minutes of the cash session (after 12:45 p.m. PDT). Cancel working DAY opens then. Exit polls still run.

## 2. Tape

Each scan:

1. `get_most_active_stocks` volume top 30.
2. Union `get_market_movers` stocks (top 10 Tue/Wed, top 20 from Thu).
3. Drop crypto, OTC, halted, last < $10, names with an open or working package.
4. Drop corp actions (div/split/merger/spinoff) in the next 21 calendar days.
5. Drop **new credits** on event week: news in 36 hours matching earnings/EPS, or IV term ≤ 0.90. Debits may still score.
6. Keep names with some 0–21 DTE expiry that has contract volume ≥ 1,000 and OI ≥ 500 on short-leg candidates.
7. **Tue/Wed:** rank by that window’s option volume. Max 15 names. Keep SPY and QQQ if they pass leg liquidity, unless they fail 4–5 or already have a package.
8. **From Thu 3 Sep (last full day):** follow packages that are currently green. Side = bull vs bear **unrealized P&L** on open stock verticals (not headcount). Index, inverse, and 3x ETFs do not vote; irons do not vote. If that sleeve’s total is not > 0, no new risk. New tickets are only that side’s verticals. Tape seeds the clusters of the **green** names (mega / semi / fintech / crypto / …) and keeps names in those clusters with |Δ| ≥ 0.5% the same way. Rank by |Δ|. No SPY/QQQ backstop. Working DAY opens do not vote.

Ignore a model ticker that is not on the tape. Thursday new risk follows the profitable open verticals (bull if the green stock bulls are making money, bear if the green stock bears are). Irons and the opposite side are off so stacked same-way tickets can fill the 20% book. Mix cap on that side is 20; the book % still binds.

Tenor: 0–21 calendar DTE, one expiry per ticket. Always score expiries that settle on or before Fri 4 Sep (including 0DTE). Also score those closest to 7, 14, and 21 DTE. No new risk on Fri 4 Sep, so Friday 0DTE is not opened. Thursday 3 Sep 0DTE is allowed; assignment that day is in Alpaca’s Thursday EOD figure.

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

Monte Carlo hold map, 1500 trials, rate 0.05, day step 1, targets 25/50/75/100. Volatility = average listed IV of the legs; skip if any required IV is missing. 0DTE is one day-step to a cash mark. Official equity is a Friday 4 Sep 9:30 ET mark, not expiration, so gates use the Friday / manage-by row.

Keep a candidate only if:

- Probability of profit on the manage-by day ≥ 35 and mean mark P&L that day ≥ 0
- P(reach 25% of max profit by manage-by) ≥ 25
- manage-by days = min(max(DTE, 1), calendar days to 2026-09-04), at least 1

Expiry POP stays on the grid for eyes. It does not pass or rank a package.

Rank by manage-by 50% cell, then Friday POP, then Friday mean P&L, then fewer DTE, then vertical over iron. Select `(underlying, template, expiration)`. Log overrides when the model loses. None pass → no-trade.

## 5. Size, book, limit

Qty = floor(1% of equity / |maxLoss|). Strip model qty. Skip if qty < 1.

Open defined-risk |maxLoss|×qty ≤ **10% of equity on Tue 1 Sep** (~ten 1% tickets), **15% on Wed 2 Sep** (~fifteen), and **20% from Thu 3 Sep** (~twenty). That book is the concurrent ceiling — there is no separate daily open count. Equity halt pairs with the hole: **$90k Tue**, **$85k Wed**, **$80k from Thu** (or `hackathon/HALT`). One package per name. Mix **4/4/4 Tue**, **5/5/5 Wed**, and **session-side verticals / 20 from Thu** (no new irons or opposite-side tickets; new risk follows the green open sleeve). A working open counts as that name’s package. Unattended qty is also capped at 12 lots (`LOOP_MAX_QTY`, default 12) so a units bug cannot send a 45-lot.

DAY only. Join net NBBO: debit at net ask, credit at net bid. Do not cross. Closes: buying back a credit uses net ask; selling a debit uses net bid.

## 6. Cycle

Scan every 2.5 minutes from 9:30–10:30 a.m. ET (open print after overnight/weekend), then every 15 minutes. 4-minute wall; if a scan runs long, the next starts 2.5 or 15 minutes after it finishes. If time expires, pick among maps already finished. One new open per scan, one working DAY open. Cancel unfilled **opens** at scan end and at the last-15-minutes cutoff. Working **closes** stay until fill, stale-replace, or the mark is no longer take/stop.

Exit poll every 60 seconds while anything is open: marks only, no Monte Carlo.

## 7. Closer

Take profit at 50% of **position** max profit (per-lot maxProfit × qty). Stop at 50% of **position** defined risk (per-lot maxLoss × qty). Mark = package net mid vs filled entry. Do not stop in the first 3 minutes after the open fill — joining NBBO then marking mid is not a 50% loss. Take-profit may still fire. After a stop, do not open that name again this cash session; cancel a working DAY that is a re-entry.

No new official risk after Thursday 3 Sep last 15 minutes, and none on Friday 4 Sep. Thursday EOD marks plus Sep 3 assignment are what Alpaca described as the scored book. Leave packages on through the **Friday 4 Sep 9:30 a.m. ET** snapshot, then flatten. Do not flatten Thursday night or Friday before 9:30 a.m. ET.

Close path: join-NBBO DAY mleg. Do not restack a close while one is working. If join walks through the working limit, cancel and replace next tick. Qty-lock rejects do not halt. Two true mleg rejects then `close_position`; leftover with no working order writes the halt file. Assignment: flatten the rest of the package.

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

Allow: bull/bear call and put verticals, iron condor, iron butterfly, 0–21 DTE including 0DTE, explicit no-trade, scan with modelSkip.

Deny: naked shorts, unlimited-loss straddles/strangles/ratios, stock, crypto, single-leg, calendars, diagonals, off-tape names, second package in a name, re-open after a stop the same session, live trading, market mleg, model qty/limit/OCC, invented P&L, holding a working DAY **open** into the next scan or into the last 15 minutes of RTH, a send path that is not the MCP-shaped paper door.
