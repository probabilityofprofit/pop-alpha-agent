export default function PolicyPage() {
  return (
    <article className="panel policy">
      <header className="panel-head">Governor, this window</header>
      <div className="panel-body">
        <p>
          This desk was authored 28 Aug 2026. Defined-risk verticals, a probability-of-profit hold
          map, paper Alpaca. Execution is MCP only.
        </p>
        <ol>
          <li>
            Paper only. Desk HTTP is GET against paper-api.alpaca.markets. The desk never places.
            The unattended loop may POST the same MCP-shaped mleg when LOOP_SEND=true.
          </li>
          <li>
            Opens: Cursor MCP <span className="mono">place_option_order</span> mleg, or that same
            payload via the paper door. The model never calls either.
          </li>
          <li>Templates: bull/bear call and put verticals, iron condor, iron fly. Unlimited loss is a veto.</li>
          <li>Size: floor(1% equity / |max loss|). Book cap 10%. Halt at $90k or hackathon/HALT. Five new opens per session. Mix: two bull, two bear, two irons.</li>
          <li>Tenor 7–21 DTE. Join NBBO DAY. Take 50% of max profit; stop 50% of defined risk.</li>
          <li>
            Official P&amp;L: new $100k paper, total equity (not cash). Window Mon 31 9:30 a.m. ET →
            Fri 4 9:30 a.m. ET. Thursday 3 Sep EOD (Sep 3 assignment in) plus Friday 9:30 a.m. ET
            snapshot. Flatten after that snapshot. Friday 28 is the test book only. Judges also score
            the workflow, not P&amp;L alone.
          </li>
        </ol>
        <p>
          Full text: <span className="mono">GOVERNOR.md</span>
        </p>
      </div>
    </article>
  );
}
