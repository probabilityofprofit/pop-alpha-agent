"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { money, pnlClass, signedMoney } from "@/desk/fmt";
import { Tip } from "@/desk/tip";
import { TipLayer } from "@/desk/tip-layer";
import type { DeskPayload } from "@/lib/desk-types";

const LINKS = [
  { href: "/contest", label: "Contest", tip: "Hackathon week, official P&L clock, and repo feature history." },
  { href: "/", label: "Desk", tip: "Live or frozen proposal, hold map, short ledger, MCP door, and blotter." },
  { href: "/tape", label: "Tape", tip: "Load a 0–21 DTE chain and dry-run a name. Does not place." },
  { href: "/scan", label: "Scan", tip: "Last universe the loop scored — kept names and drop reasons." },
  { href: "/book", label: "Book", tip: "Thursday EOD book (frozen), live packages, and recent Alpaca orders." },
  { href: "/ledger", label: "Ledger", tip: "Full hackathon/ledger.jsonl — every cycle, veto, fill, and halt." },
  { href: "/loop", label: "Loop", tip: "Heartbeat, capacity, LOOP_SEND, and last skip." },
  { href: "/risk", label: "Risk", tip: "Live governor gates: size, book, halt, mix, Friday mark." },
  { href: "/policy", label: "Policy", tip: "Contest narrative — paper only, MCP door, scored window." },
];

const REPO_URL = "https://github.com/probabilityofprofit/pop-alpha-agent";
const LABLAB_URL =
  "https://lablab.ai/ai-hackathons/alpaca-ai-trading-agents-hackathon/probability-of-profit";

function GitHubMark() {
  return (
    <svg className="repo-mark" viewBox="0 0 16 16" width={14} height={14} aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

export function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [desk, setDesk] = useState<DeskPayload | null>(null);

  useEffect(() => {
    const load = () => {
      void fetch("/api/desk", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: DeskPayload) => setDesk(j));
    };
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const equity = desk?.account?.equity;
  const last = desk?.account?.last_equity;
  const dayPnl =
    equity != null && last != null && Number.isFinite(Number(equity)) && Number.isFinite(Number(last))
      ? Number(equity) - Number(last)
      : null;
  const open = desk?.clock?.is_open;

  return (
    <div className="shell">
      <header className="topbar">
        <Link
          href="/"
          className="brand"
          data-tip="POP Alpha Desk — governed paper options cockpit for the Alpaca hackathon."
          data-tip-pos="below"
        >
          <img className="brand-logo" src="/icon.png" alt="POP" width={22} height={22} />
          <strong>POP</strong>
          <em>Alpha Desk</em>
        </Link>
        <div
          className="env"
          data-tip="Paper only. LIVE is disabled for this hackathon desk."
          data-tip-pos="below"
        >
          <span className="on">
            <span className="dot" />
            PAPER
          </span>
          <button type="button" className="off" disabled>
            <span className="dot" />
            LIVE
          </button>
        </div>
        <div
          className="clock"
          data-tip={open ? "Alpaca cash session is open (America/New_York)." : "Cash session closed. Exit polls may still run."}
          data-tip-pos="below"
        >
          <span className={`dot ${open ? "live" : "idle"}`} />
          {open ? "Market open" : "Market closed"}
        </div>
        <div className="topbar-right">
          <div className="ext-links">
            <a
              className="repo-link"
              href={LABLAB_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-tip="Open the Probability of Profit team page on LabLab."
              data-tip-pos="below"
            >
              <img className="lablab-mark" src="/lablab.png" alt="" width={14} height={14} />
              <span>LabLab</span>
            </a>
            <a
              className="repo-link"
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-tip="Open the contest repository on GitHub."
              data-tip-pos="below"
            >
              <GitHubMark />
              <span>GitHub</span>
            </a>
          </div>
          <div className="metrics">
            <div className="metric">
              <Tip tip="Alpaca paper total equity — the contest scores equity, not cash." below>
                <b>Equity</b>
              </Tip>
              <span className="mono">{money(equity)}</span>
            </div>
            <div className="metric">
              <Tip tip="Change vs last_equity from the paper account." below>
                <b>Day P&L</b>
              </Tip>
              <span className={`mono ${pnlClass(dayPnl)}`}>{signedMoney(dayPnl)}</span>
            </div>
            <div className="metric">
              <Tip tip="HALT file or equity at/under the live floor ($90k Tue, $85k Wed, $80k from Thu). Flattening still allowed; no new risk." below>
                <b>Halt</b>
              </Tip>
              <span className={desk?.halt ? "down" : "up"}>{desk?.halt ? "HALT" : "Clear"}</span>
            </div>
          </div>
        </div>
      </header>
      <div className="body">
        <nav className="side">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              data-active={path === link.href ? "true" : "false"}
              data-tip={link.tip}
              data-tip-pos="right"
            >
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        <main className="main">{children}</main>
      </div>
      <TipLayer />
    </div>
  );
}
