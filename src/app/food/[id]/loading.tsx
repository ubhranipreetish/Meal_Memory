import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function FoodDetailLoading() {
  return (
    <AppShell
      active="/settings"
      eyebrow="YOUR FOOD"
      aside={<Link href="/settings#saved-foods" style={{ color: "inherit" }}>← Saved foods</Link>}
      title="Your food, your numbers."
      subtitle="Edit anything — you're the authority on what you eat."
    >
      <div role="status" className="sr-only">
        Loading food details...
      </div>

      {/* Food editor card skeleton */}
      <section className="card section" aria-hidden="true">
        <div className="row between">
          <div>
            <span className="skeleton h-6 w-36" />
            <span className="skeleton mt-2 h-3 w-20" />
          </div>
          <span className="skeleton size-8 rounded-full" />
        </div>

        <div className="grid2 mt-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i}>
              <span className="skeleton h-3 w-24" />
              <span className="skeleton mt-1 h-11 w-full" />
            </div>
          ))}
        </div>

        <span className="skeleton mt-4 h-11 w-full" />
      </section>

      {/* About this food card skeleton */}
      <section className="card section" aria-hidden="true">
        <span className="skeleton h-5 w-36" />
        <div className="mt-3">
          {["w-8", "w-20", "w-16"].map((width, i) => (
            <div key={i} className="row between small" style={{ padding: "6px 0" }}>
              <span className="skeleton h-4 w-24" />
              <span className={`skeleton h-4 ${width}`} />
            </div>
          ))}
        </div>
      </section>

      <span className="skeleton mt-4 h-4 w-3/4" />
    </AppShell>
  );
}
