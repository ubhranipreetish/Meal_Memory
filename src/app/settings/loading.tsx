import { AppShell } from "@/components/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SettingsLoading() {
  return (
    <AppShell active="/settings" title="Profile & Settings">
      <div role="status" className="sr-only">
        Loading settings...
      </div>

      {/* Goals & daily targets */}
      <section className="card section" aria-hidden="true">
        <div className="row between items-center">
          <h2>Goals &amp; daily targets</h2>
          <span className="skeleton h-8 w-16 rounded-md" />
        </div>
        <div className="mt-3">
          <div
            className="row between small"
            style={{ padding: "9px 0", borderBottom: "1px solid var(--pg-border)" }}
          >
            <span className="muted">Primary goal</span>
            <span className="skeleton h-4 w-24" />
          </div>

          <div className="grid2 mt-3">
            {["Calories", "Protein", "Carbs", "Fat", "Water", "Fibre"].map((label) => (
              <div className="card" key={label}>
                <p className="small muted">{label}</p>
                <span className="skeleton mt-1 h-7 w-20" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Body stats & details */}
      <section className="card section" aria-hidden="true">
        <div className="row between items-center">
          <h2>Body stats &amp; details</h2>
          <span className="skeleton h-8 w-16 rounded-md" />
        </div>
        <div className="mt-3">
          {["Name", "Gender", "Height", "Weight", "Diet"].map((label) => (
            <div
              key={label}
              className="row between small"
              style={{ padding: "9px 0", borderBottom: "1px solid var(--pg-border)" }}
            >
              <span className="muted">{label}</span>
              <span className="skeleton h-4 w-24" />
            </div>
          ))}
        </div>
      </section>

      {/* Appearance */}
      <section className="card section row between">
        <h2>Appearance</h2>
        <ThemeToggle />
      </section>

      {/* Saved foods */}
      <section className="card section" aria-hidden="true">
        <h2>Saved foods</h2>
        <p className="small muted mt-1">Choose a food to edit its serving size and nutrition.</p>
        <div className="mt-4 spaced">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="row between"
              style={{ padding: "10px 0", borderBottom: i < 2 ? "1px solid var(--pg-border)" : undefined }}
            >
              <div>
                <span className="skeleton h-4 w-28" />
                <span className="skeleton mt-1 h-3 w-20" />
              </div>
              <span className="skeleton h-4 w-4" />
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
