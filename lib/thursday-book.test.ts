import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import {
  afterContestSnapshot,
  buildThursdayBook,
  loadThursdayBook,
  saveThursdayBookOnce,
} from "./thursday-book";

describe("thursday-book", () => {
  const dirs: string[] = [];
  after(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  it("is after snapshot only at/after Fri 4 Sep 9:30 ET", () => {
    assert.equal(afterContestSnapshot(new Date("2026-09-04T13:29:59.000Z")), false);
    assert.equal(afterContestSnapshot(new Date("2026-09-04T13:30:00.000Z")), true);
  });

  it("writes once and never overwrites", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "thu-book-"));
    dirs.push(dir);
    const file = path.join(dir, "thursday-book.json");
    const first = buildThursdayBook({
      asOf: new Date("2026-09-03T21:00:00.000Z"),
      account: { account_number: "PA3K9GXACTM7", equity: "96951.85", cash: "100829.85" },
      positions: [
        {
          symbol: "AAL260918C00013000",
          asset_class: "us_option",
          side: "short",
          qty: "-12",
          avg_entry_price: "0.55",
          current_price: "0.48",
          market_value: "-576",
          unrealized_pl: "84",
        },
        {
          symbol: "AAL260918C00014000",
          asset_class: "us_option",
          side: "long",
          qty: "12",
          avg_entry_price: "0.2",
          current_price: "0.14",
          market_value: "168",
          unrealized_pl: "-72",
        },
      ],
    });
    assert.equal(saveThursdayBookOnce(first, file).wrote, true);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).equity, "96951.85");

    const second = buildThursdayBook({
      asOf: new Date("2026-09-04T14:00:00.000Z"),
      account: { account_number: "PA3K9GXACTM7", equity: "1", cash: "1" },
      positions: [],
    });
    const again = saveThursdayBookOnce(second, file);
    assert.equal(again.wrote, false);
    assert.equal(again.book?.equity, "96951.85");
    assert.equal(loadThursdayBook(file)?.packageCount, 1);
  });
});
