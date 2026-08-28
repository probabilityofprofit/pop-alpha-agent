import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseOcc } from "./occ";

describe("occ", () => {
  it("parses the Friday test-book short put", () => {
    const row = parseOcc("SPY260911P00773000");
    assert.ok(row);
    assert.equal(row!.root, "SPY");
    assert.equal(row!.expiration, "2026-09-11");
    assert.equal(row!.right, "put");
    assert.equal(row!.strike, 773);
  });
  it("rejects junk", () => {
    assert.equal(parseOcc("SPY"), null);
  });
});
