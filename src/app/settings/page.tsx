import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { GOAL_LABELS } from "@/types/profile";
import { listSavedFoods } from "@/lib/services/history";
import { SavedFoodsList } from "@/components/SavedFoodsList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppShell } from "@/components/AppShell";

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
  return (
    <AppShell active="/settings" title="Profile">
      <section className="card section">
        <h2>Profile &amp; goals</h2>
        <div className="mt-3">
          <Row label="Name" value={profile.name ?? "—"} />
          <Row label="Gender" value={profile.gender ?? "—"} />
          <Row label="Height" value={profile.heightCm ? `${profile.heightCm} cm` : "—"} />
          <Row label="Weight" value={profile.currentWeightKg ? `${profile.currentWeightKg} kg` : "—"} />
          <Row label="Goal" value={profile.goal ? GOAL_LABELS[profile.goal as keyof typeof GOAL_LABELS] : "—"} />
          <Row label="Diet" value={profile.dietType ?? "—"} />
        </div>
        <Link href="/onboarding?from=settings" className="primary mt-4">
          Edit profile &amp; recalculate targets
        </Link>
        <p className="small muted mt-2">Editing re-runs the calorie &amp; macro calculation and updates your targets.</p>
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
