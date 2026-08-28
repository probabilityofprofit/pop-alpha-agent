export default function PolicyPage() {
  return (
    <article className="panel policy">
      <header className="panel-head">Governor, this window</header>
      <div className="panel-body">
        <p>
          This desk is new work authored 28 Aug 2026 in the contest repo. It is not a copy of the
          pre-existing POP Option Trading Terminal. Concepts that overlap: defined-risk verticals, a
          probability-of-profit hold map, paper Alpaca. Execution is MCP only.
        </p>
        <ol>
          <li>Paper only. Trading HTTP is GET against paper-api.alpaca.markets. No REST place.</li>
          <li>
            Opens: Cursor MCP <span className="mono">place_option_order</span> mleg. The model never
            calls it.
          </li>
          <li>Templates: bull/bear call and put verticals, iron condor, iron fly. Unlimited loss is a veto.</li>
          <li>Size: floor(1% equity / |max loss|). Book cap 5%. Halt at $95k or hackathon/HALT.</li>
          <li>Tenor 7–21 DTE. Join NBBO DAY. Take 50% of max profit; stop 50% of defined risk.</li>
          <li>
            Official P&amp;L: Mon 31 Aug 2026 9:30 a.m. ET → Fri 4 Sep 2026 9:30 a.m. ET on a new paper
            account. Friday 28 is the test book only.
          </li>
        </ol>
        <p>
          Full text: <span className="mono">GOVERNOR.md</span>
        </p>
      </div>
    </article>
  );
}
