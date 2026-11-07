import Link from "next/link";

/** Every screen the prototype can render (companion.tsx switches on this). */
export const PREVIEW_SCREENS: { slug: string; label: string; note: string }[] = [
  { slug: "home", label: "Today", note: "Dashboard — calorie ring, protein, water" },
  { slug: "log", label: "Eat", note: "Composer, review card, meal slots, today's feed" },
  { slug: "history", label: "History", note: "Meals and saved foods, search and filters" },
  { slug: "progress", label: "Progress", note: "Weight trend, measurements, photo journal" },
  { slug: "food", label: "Food detail", note: "One saved food, editable" },
  { slug: "settings", label: "Settings", note: "Profile and goals" },
  { slug: "onboarding", label: "Onboarding", note: "Three short steps" },
];

export default function PreviewIndexPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Design preview</p>
        <h1 className="mt-2 text-2xl font-semibold">New UI — all screens</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Sample data only. Nothing here reads or writes your real logs — the working app is at{" "}
          <Link href="/home" className="text-emerald-600 underline underline-offset-4">
            /home
          </Link>
          .
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {PREVIEW_SCREENS.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/preview/${s.slug}`}
              className="flex items-baseline justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3 hover:border-emerald-500 dark:border-neutral-800"
            >
              <span className="text-sm font-medium">{s.label}</span>
              <span className="text-right text-xs text-neutral-500">{s.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
