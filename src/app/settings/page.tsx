import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { DIET_LABELS } from "@/types/profile";
import { listSavedFoods } from "@/lib/services/history";
import { SavedFoodsList } from "@/components/SavedFoodsList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppShell } from "@/components/AppShell";
import { GoalsAndTargetsEditor } from "./GoalsAndTargetsEditor";
import type { Targets, Goal, Gender, ActivityLevel } from "@/lib/services/targets";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const [[profile], foods] = await Promise.all([
    db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).limit(1),
    listSavedFoods(user.id),
  ]);
  if (!profile) redirect("/onboarding");

  const defaultTargets: Targets = {
    bmr: 1600,
    tdee: 2200,
    kcal: 2000,
    proteinG: 140,
    carbsG: 200,
    fatG: 60,
    fiberG: 28,
    waterMl: 2500,
    steps: 8000,
  };

  const dietDisplay = profile.dietType && profile.dietType in DIET_LABELS
    ? DIET_LABELS[profile.dietType as keyof typeof DIET_LABELS]
    : profile.dietType ?? "—";

  return (
    <AppShell active="/settings" title="Profile & Settings">
      {/* Goals & daily targets - directly editable */}
      <GoalsAndTargetsEditor
        initialGoal={(profile.goal as Goal) ?? "build_muscle"}
        initialTargets={(profile.targets as Targets) ?? defaultTargets}
        gender={(profile.gender as Gender) ?? null}
        dob={profile.dob}
        heightCm={profile.heightCm}
        weightKg={profile.currentWeightKg}
        activityLevel={(profile.activityLevel as ActivityLevel) ?? null}
      />

      {/* Body stats & profile details */}
      <section className="card section">
        <h2>Body stats &amp; details</h2>
        <div className="mt-3">
          <Row label="Name" value={profile.name ?? "—"} />
          <Row label="Gender" value={profile.gender ?? "—"} />
          <Row label="Height" value={profile.heightCm ? `${profile.heightCm} cm` : "—"} />
          <Row label="Weight" value={profile.currentWeightKg ? `${profile.currentWeightKg} kg` : "—"} />
          <Row label="Diet" value={dietDisplay} />
        </div>
        <Link href="/onboarding?from=settings" className="secondary mt-4 w-full justify-center">
          Edit body stats &amp; preferences
        </Link>
        <p className="small muted mt-2">Update your age, height, weight, activity level, or dietary preferences.</p>
      </section>

      <section className="card section row between">
        <h2>Appearance</h2>
        <ThemeToggle />
      </section>

      <section className="card section scroll-mt-4" id="saved-foods">
        <h2>Saved foods</h2>
        <p className="small muted mt-1">Choose a food to edit its serving size and nutrition.</p>
        <SavedFoodsList foods={foods} />
      </section>

      <form action={signOut} className="section">
        <button className="secondary row w-full justify-center" type="submit">
          <LogOut size={18} aria-hidden="true" /> Sign out
        </button>
      </form>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row between small" style={{ padding: "9px 0", borderBottom: "1px solid var(--pg-border)" }}>
      <span className="muted">{label}</span>
      <span className="min-w-0 break-words text-right">{value}</span>
    </div>
  );
}
