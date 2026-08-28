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
npm install
npm test
npm run scan
```

`npm run scan` runs the governor on a built-in demo chain and prints an MCP `place_option_order` payload. It does **not** send the order. Cursor (or any MCP host) is the door: pass that payload to `place_option_order`.

`npm run scan -- --paper-env` additionally asserts paper-only env (`ALPACA_PAPER_TRADE=true`, no live keys).

## Cockpit (this week, this repo)

A new blotter/log UI will be added here so judges can watch proposals, vetoes, and fills. It will be written in this repository during the window. It will not be a copy of the pre-existing POP workstation. Until that lands, `hackathon/ledger.jsonl` is the record.

## License

Private until the lablab submission, then public as required by the event.
