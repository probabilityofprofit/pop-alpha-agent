/** OCC parser for this week's desk. Authored 28 Aug 2026. */

export type ParsedOcc = {
  root: string;
  expiration: string;
  right: "call" | "put";
  strike: number;
};

const OCC = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([PC])(\d{8})$/;

export function parseOcc(occ: string): ParsedOcc | null {
  const m = occ.match(OCC);
  if (!m) return null;
  const year = 2000 + Number(m[2]);
  const month = m[3];
  const day = m[4];
  return {
    root: m[1]!,
    expiration: `${year}-${month}-${day}`,
    right: m[5] === "C" ? "call" : "put",
    strike: Number(m[6]) / 1000,
  };
}
