import { LEDGER_KINDS } from "@/governor/ledger";
import { DESK_LEDGER_LIMIT, readLedger } from "@/lib/read-ledger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ kinds: LEDGER_KINDS, rows: readLedger(DESK_LEDGER_LIMIT) });
}
