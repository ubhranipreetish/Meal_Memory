import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { GOAL_LABELS } from "@/types/profile";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = getDb();
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, user.id)).limit(1);
  if (!profile) redirect("/onboarding");

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-5 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <Link href="/home" className="text-sm text-neutral-500 underline underline-offset-4">Home</Link>
      </header>

      <section className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
        <Row label="Name" value={profile.name ?? "—"} />
        <Row label="Gender" value={profile.gender ?? "—"} />
        <Row label="Height" value={profile.heightCm ? `${profile.heightCm} cm` : "—"} />
        <Row label="Weight" value={profile.currentWeightKg ? `${profile.currentWeightKg} kg` : "—"} />
        <Row label="Goal" value={profile.goal ? GOAL_LABELS[profile.goal as keyof typeof GOAL_LABELS] : "—"} />
        <Row label="Diet" value={profile.dietType ?? "—"} />
      </section>

      <Link href="/onboarding" className="rounded-lg bg-emerald-600 px-5 py-2.5 text-center text-sm font-medium text-white">
        Edit profile & re-calculate targets
      </Link>
      <p className="text-sm text-neutral-500">Editing re-runs the calorie & macro calculation and updates your targets.</p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-neutral-100 py-2 text-sm last:border-0 dark:border-neutral-900">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
