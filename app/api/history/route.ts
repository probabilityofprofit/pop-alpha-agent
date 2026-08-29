import { execFileSync } from "node:child_process";
import { HISTORY_FALLBACK, type HistoryRow } from "@/lib/contest-timeline";
import { repoRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fromGit(): HistoryRow[] {
  const text = execFileSync(
    "git",
    ["-C", repoRoot(), "log", "--reverse", `--format=%h%x09%ad%x09%s`, "--date=short"],
    { encoding: "utf8", timeout: 4000 },
  );
  const rows: HistoryRow[] = [];
  for (const line of text.split("\n")) {
    const [hash, date, title] = line.split("\t");
    if (hash && date && title) rows.push({ hash, date, title });
  }
  return rows;
}

export async function GET() {
  try {
    const rows = fromGit();
    if (rows.length) return Response.json({ source: "git", rows });
  } catch {
    /* dyno without .git */
  }
  return Response.json({ source: "fallback", rows: HISTORY_FALLBACK });
}
