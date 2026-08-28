# POP Alpha Agent

Alpaca × lablab **Options Alpha Agents** (28 Aug–4 Sep 2026).

This repository contains **only code authored during the hackathon window**. It is a governed paper options agent: Alpaca MCP places defined-risk multi-leg orders; a deterministic governor may veto the model.

## Prior work (disclosed, not included)

The author maintains a separate public options workstation, [POP Option Trading Terminal](https://github.com/probabilityofprofit/pop-option-trading-terminal). That product predates this event. **None of its source files are in this repo.** Concepts (probability of profit, defined-risk verticals, a heatmap-style hold map) are re-implemented here this week. Judges should review this repository, not the terminal.

## What this agent does

1. Build a liquid options tape from Alpaca MCP (`get_most_active_stocks`, `get_market_movers`, chains).
2. Optional LLM emits a small JSON hint (name / structure / bias). It never calls the broker.
3. Governor builds defined-risk verticals or irons, scores a hold map, sizes 1% of equity, joins NBBO.
4. Execution is MCP `place_option_order` (mleg) on **paper only**.
5. Ledger + contest snapshot for the official P&L window.

## Official P&L window

**Mon 31 Aug 2026 9:30 a.m. ET → Fri 4 Sep 2026 9:30 a.m. ET** on a **new** paper account (not Friday’s test book).

Friday 28 Aug is a test session only. Policy: [`GOVERNOR.md`](./GOVERNOR.md).

## Run (paper)

```bash
cp .env.example .env.local
# paper keys only; ALPACA_PAPER_TRADE=true
npx tsx src/index.ts
```

Requires Alpaca MCP against the paper account (`place_option_order`, `get_clock`, `get_account_info`, chains). Do not construct a live Trading API client.

## License

Private until the lablab submission, then public as required by the event.
