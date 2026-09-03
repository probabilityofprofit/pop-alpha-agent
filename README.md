# POP Alpha Agent

Alpaca × lablab **Options Alpha Agents** (28 Aug–4 Sep 2026).

This repository contains **only code authored during the hackathon window**. It is a governed paper options agent: Alpaca MCP places defined-risk multi-leg orders; a deterministic governor may veto the model.

**Live desk:** [https://lablab.probabilityofprofit.com/](https://lablab.probabilityofprofit.com/)

## What this agent does

1. Build a liquid options tape from Alpaca MCP (`get_most_active_stocks`, `get_market_movers`, chains).
2. Optional LLM emits a small JSON hint (name / structure / bias). It never calls the broker.
3. Governor builds defined-risk verticals or irons (0–21 DTE), scores a hold map to the Friday mark, sizes 1% of equity, joins NBBO.
4. Execution is MCP `place_option_order` (mleg) on **paper only**, or the unattended loop when `LOOP_SEND=true`.
5. Ledger + contest timeline + Thursday EOD book snapshot for the official P&L window.

## Official P&L window

**New** $100,000 paper account (not Friday’s test book). Last four of the account number: **`CTM7`**. First official order **Mon 31 Aug 2026 9:30 a.m. ET**.

Alpaca measures **total account equity**, not cash. Window: Mon 31 9:30 a.m. ET → Fri 4 9:30 a.m. ET. They look at Thursday 3 Sep EOD equity (Sep 3 exercise/assignment included) and snapshot equity Friday 4 Sep 9:30 a.m. ET. Dollar P&L = that equity − $100,000.

**Contest close:** photograph Friday 9:30 a.m. ET equity, **then** flatten. Do not flatten Thursday night or Friday before that snapshot. No new risk on Fri 4 Sep — the loop only closes. The Book tab keeps a frozen **Thursday EOD book** (`hackathon/thursday-book.json`) so judging packages stay visible after live positions are flat.

Judging is that equity **and** the agent workflow (creativity, autonomy, robustness). Not Sharpe. Not P&L alone.

Friday 28 Aug is a test session only (`X17N`). Policy: [`GOVERNOR.md`](./GOVERNOR.md). Market data: Alpaca Indicative options feed is allowed (this repo’s default). OPRA / Algo Trader Plus is not required.

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

Every 60 seconds it marks open packages (50% take / 50% stop) and appends a cycle row, including no-trade. In the cash session it builds a tape every 2.5 minutes from 9:30–10:30 a.m. ET, then every 15 minutes, optionally asks OpenAI for a thesis JSON (`OPENAI_API_KEY`), scores hold maps to the Friday 4 Sep mark (0–21 DTE, including 0DTE), and builds an MCP-shaped payload. Book cap is 10% Tue, 15% Wed, 20% from Thu; halt $90k / $85k / $80k. Mix 4/4/4, then 5/5/5, then Thursday one-way (session-side verticals, cap 20). From Thursday the tape follows profitable open packages and names that trade with those underlyings; irons and the other side are off. No daily open count. Last 15 minutes of RTH: no new risk; cancel every working DAY open. Unfilled DAY opens are cancelled at the next scan. Unfilled closes stay until fill, stale-replace, or the mark is no longer take/stop.

From **Fri 4 Sep 9:30 a.m. ET**, take/stop still run, and the loop also **force-flattens** every open package (one close per tick, join-NBBO DAY mleg). Scans and new opens stay off for the whole Friday session.

Default: print the payload (`LOOP_SEND` unset/false). Set `LOOP_SEND=true` in `.env.local` to have this process send that same mleg body to `paper-api.alpaca.markets` (paper keys only, DAY limit, 2–4 legs). That is the MCP `place_option_order` JSON over paper HTTP so the unattended loop can run without a human paste. The model never calls the door. Cursor MCP `place_option_order` remains valid for a human paste. Friday flatten needs `LOOP_SEND=true` to actually send closes.

Set `OPENAI_API_KEY` in `.env.local` to enable the thesis. Missing or bad JSON is `modelSkip`; the governor still scans.

## Alpha Desk

Local: `http://127.0.0.1:3001` (`npm run dev`, port 3001 so it does not collide with other local apps). Production: [lablab.probabilityofprofit.com](https://lablab.probabilityofprofit.com/).

The desk **reads** paper account / chain over GET. It **never** places orders. Tabs: Desk (proposal, hold map, blotter), Loop, Book (frozen Thursday EOD + live positions), Tape, Scan, Ledger, Risk, Policy, Contest.

`app/` + `desk/` is the cockpit. Preview a name from Tape if you want a dry run.

## License

Private until the lablab submission, then public as required by the event.
