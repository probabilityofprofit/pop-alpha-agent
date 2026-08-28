# POP Alpha Agent

Alpaca × lablab **Options Alpha Agents** (28 Aug–4 Sep 2026).

This repository contains **only code authored during the hackathon window**. It is a governed paper options agent: Alpaca MCP places defined-risk multi-leg orders; a deterministic governor may veto the model.

## What this agent does

1. Build a liquid options tape from Alpaca MCP (`get_most_active_stocks`, `get_market_movers`, chains).
2. Optional LLM emits a small JSON hint (name / structure / bias). It never calls the broker.
3. Governor builds defined-risk verticals or irons, scores a hold map, sizes 1% of equity, joins NBBO.
4. Execution is MCP `place_option_order` (mleg) on **paper only**.
5. Ledger + contest snapshot for the official P&L window.

## Official P&L window

**New** $100,000 paper account (not Friday’s test book). First official order **Mon 31 Aug 2026 9:30 a.m. ET**.

Alpaca measures **total account equity**, not cash. Window: Mon 31 9:30 a.m. ET → Fri 4 9:30 a.m. ET. They look at Thursday 3 Sep EOD equity (Sep 3 exercise/assignment included) and snapshot equity Friday 4 Sep 9:30 a.m. ET. Do not flatten before that Friday snapshot.

Judging is that equity **and** the agent workflow (creativity, autonomy, robustness). Not Sharpe. Not P&L alone.

Friday 28 Aug is a test session only. Policy: [`GOVERNOR.md`](./GOVERNOR.md). Market data: Alpaca Indicative options feed is allowed (this repo’s default). OPRA / Algo Trader Plus is not required.

GitHub may stay private until submit. This repo’s trading code was authored in-window.

## Run (paper)

```bash
npm install
npm test
npm run scan
npm run dev
```

`npm run scan` runs the governor on a built-in demo chain and prints an MCP `place_option_order` payload. It does **not** send the order. Cursor (or any MCP host) is the door: pass that payload to `place_option_order`.

`npm run scan -- --paper-env` additionally asserts paper-only env (`ALPACA_PAPER_TRADE=true`, no live keys).

The unattended loop:

```bash
npm run loop -- --once --scan-now
npm run loop
```

Every 60 seconds it marks open packages (50% take / 50% stop) and appends a cycle row, including no-trade. Every 15 minutes in the cash session it builds a tape, optionally asks OpenAI for a thesis JSON (`OPENAI_API_KEY`), scores hold maps, and builds an MCP-shaped payload. Session cap is 5 new opens. Book cap is 10% of equity; halt at $90k. Last 15 minutes of RTH: no new risk; cancel every working DAY open. Unfilled DAY opens are cancelled at the next scan.

Default: print the payload (`LOOP_SEND` unset/false). Set `LOOP_SEND=true` in `.env.local` to have this process send that same mleg body to `paper-api.alpaca.markets` (paper keys only, DAY limit, 2–4 legs). That is the MCP `place_option_order` JSON over paper HTTP so the unattended loop can run without a human paste. The model never calls the door. Cursor MCP `place_option_order` remains valid for a human paste.

Set `OPENAI_API_KEY` in `.env.local` to enable the thesis. Missing or bad JSON is `modelSkip`; the governor still scans.

The Alpha Desk is at `http://127.0.0.1:3001` (port 3001 so it does not collide with any other local app). Score a demo chain, or score SPY from paper. The desk **reads** paper account/chain over GET. It **never** places orders.

## Cockpit (this week, this repo)

`app/` + `desk/` is the cockpit: proposal, veto, hold map, ledger, MCP door JSON, paper blotter.

## License

Private until the lablab submission, then public as required by the event.
