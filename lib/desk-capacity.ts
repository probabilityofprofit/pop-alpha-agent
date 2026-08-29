import { emptyMix, mixCounts } from "../governor/mix";
import type { DeskCapacity } from "./desk-types";
import { BOOK_CAP, workingDayOrders } from "./loop-policy";
import { booksFromPositions, templateFromWorkingLegs } from "./packages-from-positions";
import type { PaperOrder, PaperPosition } from "./paper-broker";

export function deskCapacity(
  positions: PaperPosition[],
  orders: PaperOrder[],
  equity: number,
  asOf = new Date(),
): DeskCapacity {
  const books = booksFromPositions(positions, {}, asOf);
  const templates = books.map((b) => b.pkg.template);
  for (const order of workingDayOrders(orders)) {
    const template = templateFromWorkingLegs(order.legs);
    if (template) templates.push(template);
  }
  const bookUsd = books.reduce((sum, b) => sum + b.pkg.maxLoss * b.qty, 0);
  return {
    bookUsd,
    bookCapUsd: Number.isFinite(equity) && equity > 0 ? BOOK_CAP * equity : 0,
    mix: templates.length ? mixCounts(templates) : emptyMix(),
    names: books.map((b) => b.pkg.underlying),
  };
}
