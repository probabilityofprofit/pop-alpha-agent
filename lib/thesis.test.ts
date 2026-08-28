import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseThesis } from "./thesis";

describe("thesis", () => {
  it("maps a bull put hint", () => {
    const row = parseThesis({
      action: "propose",
      underlying: "spy",
      structure: "put_vertical",
      bias: "bull",
      expiration: "2026-09-11",
      thesis: "credit put",
    });
    assert.equal(row.skip, false);
    if (!row.skip) assert.deepEqual(row.preferred, ["bull_put"]);
  });
  it("skips qty from the model", () => {
    const row = parseThesis({
      action: "propose",
      underlying: "SPY",
      structure: "put_vertical",
      bias: "bull",
      qty: 4,
    });
    assert.equal(row.skip, true);
  });
  it("skips junk", () => {
    assert.equal(parseThesis("nope").skip, true);
  });
});
