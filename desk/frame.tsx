"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { money, pnlClass, signedMoney } from "@/desk/fmt";
import type { DeskPayload } from "@/lib/desk-types";

const LINKS = [
  { href: "/", label: "Desk" },
  { href: "/tape", label: "Tape" },
  { href: "/book", label: "Book" },
  { href: "/risk", label: "Risk" },
  { href: "/policy", label: "Policy" },
];

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
        <Link href="/" className="brand">
          <img className="brand-logo" src="/icon.png" alt="POP" width={22} height={22} />
          <strong>POP</strong>
          <em>Alpha Desk</em>
        </Link>
        <div className="env" title="Hackathon desk is paper-only">
          <span className="on">
            <span className="dot" />
            PAPER
          </span>
          <button type="button" className="off" disabled>
            <span className="dot" />
            LIVE
          </button>
        </div>
        <div className="clock">
          <span className={`dot ${open ? "live" : "idle"}`} />
          {open ? "Market open" : "Market closed"}
        </div>
        <div className="metrics">
          <div className="metric">
            <b>Equity</b>
            <span className="mono">{money(equity)}</span>
          </div>
          <div className="metric">
            <b>Day P&L</b>
            <span className={`mono ${pnlClass(dayPnl)}`}>{signedMoney(dayPnl)}</span>
          </div>
          <div className="metric">
            <b>Halt</b>
            <span className={desk?.halt ? "down" : "up"}>{desk?.halt ? "HALT" : "Clear"}</span>
          </div>
        </div>
      </header>
      <div className="body">
        <nav className="side">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} data-active={path === link.href ? "true" : "false"}>
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
