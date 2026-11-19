import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { LogClient } from "./LogClient";

vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));
vi.mock("./actions", () => ({}));
vi.mock("@/app/history/actions", () => ({}));

it("shows separate lunch logs together with one total and individual edit actions", () => {
  const date = "2026-11-19";
  const loggedAt = `${date}T12:00:00.000Z`;
  const feed = [
    { id: "sandwich", name: "Cheese sandwich", qty: 1, unit: "piece", kcal: 420, proteinG: 19 },
    { id: "chips", name: "Chips", qty: 48, unit: "g", kcal: 257, proteinG: 3 },
  ].map((item) => ({
    id: `log-${item.id}`,
    mealType: "lunch",
    loggedAt,
    timeLabel: "12:00 pm",
    rawInput: item.name,
    items: [item],
  }));

  const html = renderToStaticMarkup(createElement(LogClient, {
    date, yesterday: false, feed, suggestedMealType: "lunch",
  }));

  expect(html.match(/<h3[^>]*>Lunch<\/h3>/g)).toHaveLength(1);
  expect(html).toContain(">677 kcal<");
  expect(html).toContain(">22 g protein<");
  expect(html).toContain('aria-label="Remove log for Cheese sandwich"');
  expect(html).toContain('aria-label="Remove log for Chips"');
});
