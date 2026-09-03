import writeupMd from "@/lib/one-page-writeup";

export const dynamic = "force-dynamic";

type Block = { type: "h1" | "h2" | "p"; text: string };

function blocks(md: string): Block[] {
  const normalized = md.replace(/\r\n/g, "\n").trim();
  const out: Block[] = [];
  for (const raw of normalized.split(/\n\n+/)) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith("# ")) out.push({ type: "h1", text: t.slice(2).trim() });
    else if (t.startsWith("## ")) out.push({ type: "h2", text: t.slice(3).trim() });
    else out.push({ type: "p", text: t.replace(/\n/g, " ") });
  }
  return out;
}

function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/g).map((chunk, j) =>
        chunk.startsWith("`") && chunk.endsWith("`") ? (
          <span key={j} className="mono">
            {chunk.slice(1, -1)}
          </span>
        ) : (
          <span key={j}>{chunk}</span>
        ),
      )}
    </>
  );
}

export default function WriteupPage() {
  const sections = blocks(writeupMd);
  const body = sections.filter((b) => b.type !== "h1");
  return (
    <article className="panel policy">
      <header
        className="panel-head"
        data-tip="Submission write-up: AI logic, risk gates, and Alpaca wiring."
        data-tip-pos="below"
      >
        One page write-up
      </header>
      <div className="panel-body writeup">
        {body.map((b, i) =>
          b.type === "h2" ? (
            <h2 key={i} className="writeup-h2">
              {b.text}
            </h2>
          ) : (
            <p key={i} className="writeup-p">
              <RichText text={b.text} />
            </p>
          ),
        )}
        {!body.length ? <p className="writeup-p">Write-up content missing.</p> : null}
      </div>
    </article>
  );
}
