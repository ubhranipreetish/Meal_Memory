import { AppShell } from "@/components/AppShell";

export default function HistoryLoading() {
  return (
    <AppShell
      active="/history"
      eyebrow="LAST 7 DAYS"
      title="This Week"
      subtitle="Your meals and calories, including today."
    >
      <div role="status" className="sr-only">
        Loading weekly history...
      </div>

      {/* Summary metric cards */}
      <div className="grid2 section" aria-hidden="true">
        <section className="card">
          <h2>Calories logged</h2>
          <span className="skeleton mt-2 h-8 w-28" />
        </section>
        <section className="card">
          <h2>Meals logged</h2>
          <span className="skeleton mt-2 h-8 w-16" />
        </section>
      </div>

      {/* Trend chart cards */}
      <section className="card section" aria-hidden="true">
        <h2>Calorie trend</h2>
        <span className="skeleton mt-3 h-32 w-full" />
      </section>

      <section className="card section" aria-hidden="true">
        <h2>Protein trend</h2>
        <span className="skeleton mt-3 h-32 w-full" />
      </section>

      {/* Calories by meal card */}
      <section className="card section" aria-hidden="true">
        <h2>Calories by meal</h2>
        <p className="small muted">Share of calories logged this week</p>
        <div className="mt-3 spaced">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="row between small">
                <span className="skeleton h-4 w-20" />
                <span className="skeleton h-4 w-24" />
              </div>
              <span className="skeleton mt-2 h-2 w-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Daily meals section */}
      <section className="section" aria-hidden="true">
        <h2>Daily meals</h2>
        <div className="card mt-3">
          <span className="skeleton h-5 w-24" />
        </div>
      </section>
    </AppShell>
  );
}
