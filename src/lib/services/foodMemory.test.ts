import { expect, it, vi } from "vitest";
import { schema } from "@/lib/db";
import { getDailyFeed } from "./foodMemory";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  getDb: () => ({ select }),
}));

it("orders already-saved meals by slot even when they were logged out of order", async () => {
  const day = new Date("2026-11-18T12:00:00+05:30");
  const late = "2026-11-18T23:59:59.999+05:30";
  const entries = [
    { id: "breakfast", mealType: "breakfast", loggedAt: new Date("2026-11-18T09:30:00+05:30") },
    { id: "first snack", mealType: "snack", loggedAt: new Date("2026-11-18T15:00:00+05:30") },
    { id: "second snack", mealType: "snack", loggedAt: new Date("2026-11-18T17:00:00+05:30") },
    { id: "backdated dinner", mealType: "dinner", loggedAt: new Date(late) },
    { id: "backdated lunch", mealType: "lunch", loggedAt: new Date(late) },
  ].map((entry) => ({
    ...entry,
    createdAt: entry.id.startsWith("backdated") ? new Date("2026-11-19T01:00:00+05:30") : entry.loggedAt,
    rawInput: entry.id,
  }));
  const orderBy = vi.fn().mockResolvedValue(entries);
  select
    .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy }) }) })
    .mockReturnValueOnce({ from: () => ({ leftJoin: () => ({ where: async () => [] }) }) });

  const feed = await getDailyFeed("test-user", day);

  expect(orderBy).toHaveBeenCalledWith(schema.mealLogs.loggedAt, schema.mealLogs.createdAt, schema.mealLogs.id);
  expect(feed.map(({ id }) => id)).toEqual([
    "breakfast", "backdated lunch", "first snack", "second snack", "backdated dinner",
  ]);
});
