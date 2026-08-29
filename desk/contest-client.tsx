"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CONTEST_EVENTS,
  WEEK,
  contestAnchor,
  contestPhase,
  eventState,
  remainingLabel,
  todayYmd,
  type HistoryRow,
} from "@/lib/contest-timeline";

const PHASE: Record<string, string> = {
  build: "Build weekend — official book is not scoring yet",
  official: "Official P&L window — total equity is the number",
  closed: "Window closed — snapshot is the score",
};

function groupHistory(rows: HistoryRow[]): Array<{ date: string; rows: HistoryRow[] }> {
  const map = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    const list = map.get(row.date) ?? [];
    list.push(row);
    map.set(row.date, list);
  }
  return [...map.entries()].map(([date, group]) => ({ date, rows: group }));
}

function prettyDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ContestClient() {
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<"contest" | "repo">("contest");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historySource, setHistorySource] = useState<string>("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void fetch("/api/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { rows?: HistoryRow[]; source?: string }) => {
        setHistory(j.rows ?? []);
        setHistorySource(j.source ?? "");
      })
      .catch(() => setHistory([]));
  }, []);

  const phase = contestPhase(now);
  const anchor = contestAnchor(now);
  const today = todayYmd(now);
  const grouped = useMemo(() => groupHistory(history ?? []), [history]);

  return (
    <div className="contest">
      <section className="contest-hero">
        <p className="contest-kicker">Alpaca × LabLab</p>
        <h1>Options Alpha Agents</h1>
        <p className="contest-lead">
          A one-week paper-options hackathon. Build an autonomous agent, then they score a dedicated{" "}
          <span className="mono">$100,000</span> paper book on total equity — and the workflow that produced it.
        </p>
        <div className="contest-clock">
          <span
            className={`pill ${phase === "closed" ? "veto" : "propose"}`}
            data-tip={
              phase === "build"
                ? "Before Mon 31 9:30 a.m. ET — test fills do not score."
                : phase === "official"
                  ? "Official P&L window — total equity is the number."
                  : "After Fri 4 9:30 a.m. ET — snapshot is the print."
            }
          >
            {PHASE[phase]}
          </span>
          {phase !== "closed" ? (
            <span
              className="mono contest-eta tip"
              data-tip="Countdown to the next contest clock in America/New_York."
              tabIndex={0}
            >
              {anchor.label} in {remainingLabel(now, anchor.at)}
            </span>
          ) : (
            <span className="mono contest-eta">Fri 4 Sep 9:30 a.m. ET snapshot is the print</span>
          )}
        </div>
      </section>

      <div className="toolbar">
        <button
          type="button"
          className={view === "contest" ? "" : "ghost"}
          onClick={() => setView("contest")}
          data-tip="Official week clocks for newcomers and judges."
          data-tip-pos="below"
        >
          Contest week
        </button>
        <button
          type="button"
          className={view === "repo" ? "" : "ghost"}
          onClick={() => setView("repo")}
          data-tip="Features landed in this repo during the hackathon window."
          data-tip-pos="below"
        >
          Repository timeline
        </button>
      </div>

      {view === "contest" ? (
        <>
          <div className="contest-facts">
            <article>
              <b>Two clocks</b>
              <p>Build Fri 28 → Fri 4. Official P&amp;L Mon 31 9:30 a.m. ET → Fri 4 9:30 a.m. ET.</p>
            </article>
            <article>
              <b>Equity, not cash</b>
              <p>Thursday EOD (Sep 3 assignment in) plus the Friday 9:30 a.m. ET snapshot. Then flatten.</p>
            </article>
            <article>
              <b>Workflow counts</b>
              <p>Autonomy and robustness sit next to the dollar number. P&amp;L alone does not win.</p>
            </article>
          </div>

          <article className="panel">
            <header className="panel-head">The week</header>
            <div className="panel-body">
              <ol className="contest-week">
                {WEEK.map((d) => (
                  <li
                    key={d.ymd}
                    data-tone={d.tone}
                    data-today={d.ymd === today ? "true" : "false"}
                    data-tip={
                      d.tone === "test"
                        ? "Test book only — does not score."
                        : d.tone === "build"
                          ? "Build weekend. Open the official $100k paper for Monday."
                          : d.tone === "official"
                            ? "Official P&L session. Total equity scores."
                            : d.ymd === "2026-09-03"
                              ? "Thursday EOD mark includes Sep 3 assignment."
                              : "Friday 9:30 a.m. ET snapshot, then flatten."
                    }
                    data-tip-pos="below"
                  >
                    <span className="contest-week-dow">{d.dow}</span>
                    <span className="contest-week-day mono">{d.day}</span>
                    <span className="contest-week-tag">{d.tag}</span>
                  </li>
                ))}
              </ol>
            </div>
          </article>

          <article className="panel">
            <header className="panel-head">Contest timeline</header>
            <div className="panel-body">
              <ol className="tl">
                {CONTEST_EVENTS.map((event, i) => {
                  const next = CONTEST_EVENTS[i + 1]?.at;
                  const state = eventState(event.at, now, next);
                  return (
                    <li key={event.id} data-state={state}>
                      <div className="tl-rail" />
                      <div className="tl-card">
                        <div className="tl-meta">
                          <span className="pill">{event.tag}</span>
                          <span className="mono">{event.when}</span>
                          {state === "now" ? <span className="tl-now">Now</span> : null}
                        </div>
                        <h2>{event.title}</h2>
                        <p>{event.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </article>

          <p className="contest-foot">
            Gates live on <Link href="/risk">Risk</Link>. Narrative on <Link href="/policy">Policy</Link>. The loop
            journal is <Link href="/ledger">Ledger</Link>.
          </p>
        </>
      ) : (
        <article className="panel">
          <header className="panel-head">
            This repository
            <span className="mono" style={{ color: "var(--faint)", fontWeight: 500 }}>
              {history?.length ?? 0} commits · {historySource === "git" ? "live git" : "authored list"}
            </span>
          </header>
          <div className="panel-body">
            <p>
              Only code written in the hackathon window. Features land as commits on{" "}
              <span className="mono">main</span>.
            </p>
            <ol className="tl">
              {grouped.map((group) => (
                <li key={group.date} data-state="past">
                  <div className="tl-rail" />
                  <div className="tl-card">
                    <div className="tl-meta">
                      <span className="pill propose">Shipped</span>
                      <span className="mono">{prettyDay(group.date)}</span>
                    </div>
                    <ul className="tl-commits">
                      {group.rows.map((row) => (
                        <li key={row.hash}>
                          <span className="mono tl-hash">{row.hash}</span>
                          <span>{row.title}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ol>
            {!history?.length ? <p>No history loaded.</p> : null}
          </div>
        </article>
      )}
    </div>
  );
}
