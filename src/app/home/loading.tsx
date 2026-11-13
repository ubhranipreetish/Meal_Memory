import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell, todayLabel } from "@/components/AppShell";

export default function HomeLoading() {
  return (
    <AppShell
      active="/home"
      className="home-dashboard"
      eyebrow={todayLabel()}
      title="Hi there."
    >
      <div role="status" className="sr-only">
        Loading home dashboard...
      </div>

      {/* Hero: today's energy gauge */}
      <section className="card section home-energy text-center" aria-hidden="true">
        <p className="eyebrow muted">CALORIES TODAY</p>
        <div className="energy-gauge">
          <svg viewBox="0 0 260 180" className="size-full">
            <path
              d="M 35 145 A 100 100 0 1 1 225 145"
              pathLength="100"
              fill="none"
              stroke="var(--pg-muted)"
              strokeWidth="12"
              strokeLinecap="round"
            />
          </svg>
          <div className="energy-value">
            <span className="skeleton h-10 w-28 mx-auto" />
            <span className="skeleton mt-2 h-3 w-20 mx-auto" />
          </div>
        </div>
        <span className="skeleton h-4 w-32 mx-auto" />
      </section>

      <Link className="primary mt-4 pointer-events-none opacity-85" href="/log" tabIndex={-1}>
        Log a meal <Plus size={18} aria-hidden="true" />
      </Link>

      {/* Uniform 2x2 grid for all 4 macros */}
      <section className="card section home-macros" aria-label="Daily macros" aria-hidden="true">
        <div className="grid2" style={{ rowGap: 20 }}>
          {["Protein", "Fibre", "Carbs", "Fat"].map((name) => (
            <div key={name}>
              <div className="row between">
                <h2>{name}</h2>
                <span className="skeleton h-5 w-16" />
              </div>
              <div className="bar">
                <i className="skeleton w-1/3" />
              </div>
              <span className="skeleton mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
