import { describe, expect, it } from "vitest";
import { dateKey, dayBounds, hourInTimeZone, recentWeek } from "./time";

describe("timezone-safe day handling", () => {
  it("uses the configured local date instead of the server's UTC date", () => {
    const instant = new Date("2026-09-20T20:00:00.000Z");
    expect(dateKey(instant, "Asia/Kolkata")).toBe("2026-09-21");
    expect(hourInTimeZone(instant, "Asia/Kolkata")).toBe(1.5);
  });

  it("returns exact Kolkata midnight bounds", () => {
    const bounds = dayBounds(new Date("2026-09-21T10:00:00.000Z"), "Asia/Kolkata");
    expect(bounds.key).toBe("2026-09-21");
    expect(bounds.start.toISOString()).toBe("2026-09-20T18:30:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-21T18:30:00.000Z");
  });

  it("includes today and the previous six local dates across month boundaries", () => {
    const week = recentWeek(new Date("2026-11-01T19:00:00Z"), "Asia/Kolkata");
    expect(week.keys).toEqual(["2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30", "2026-10-29", "2026-10-28", "2026-10-27"]);
    expect(week.start.toISOString()).toBe("2026-10-26T18:30:00.000Z");
    expect(week.end.toISOString()).toBe("2026-11-02T18:30:00.000Z");
  });

  it("handles daylight-saving days without assuming 24 hours", () => {
    const bounds = dayBounds(new Date("2026-03-08T16:00:00.000Z"), "America/New_York");
    expect(bounds.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
});
