import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contestAnchor, contestPhase, eventState, remainingLabel } from "./contest-timeline";

describe("contest clocks", () => {
  it("is build weekend before Monday 9:30 ET", () => {
    const sat = new Date("2026-08-29T20:00:00Z");
    assert.equal(contestPhase(sat), "build");
    assert.equal(contestAnchor(sat).label, "Official book opens");
  });
  it("is official between Monday open and Friday snapshot", () => {
    const tue = new Date("2026-09-01T14:00:00Z");
    assert.equal(contestPhase(tue), "official");
    assert.equal(contestAnchor(tue).label, "Snapshot");
  });
  it("closes at the Friday 9:30 ET snapshot", () => {
    const after = new Date("2026-09-04T13:31:00Z");
    assert.equal(contestPhase(after), "closed");
    assert.equal(contestAnchor(after).label, "Window closed");
  });
  it("labels remaining time", () => {
    assert.equal(remainingLabel(new Date("2026-08-29T13:30:00Z"), Date.parse("2026-08-31T13:30:00Z")), "2d 0h");
    assert.equal(remainingLabel(new Date("2026-09-04T13:00:00Z"), Date.parse("2026-09-04T13:30:00Z")), "30m");
  });
  it("marks the open event as now until the next one", () => {
    const mon = new Date("2026-08-31T15:00:00Z");
    assert.equal(eventState(Date.parse("2026-08-31T13:30:00Z"), mon, Date.parse("2026-09-01T13:30:00Z")), "now");
    assert.equal(eventState(Date.parse("2026-09-01T13:30:00Z"), mon, Date.parse("2026-09-03T13:30:00Z")), "next");
  });
});
