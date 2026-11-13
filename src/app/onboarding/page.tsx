import { OnboardingForm, type InitialProfileData } from "./OnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const fromSettings = from === "settings";

  let initialProfile: InitialProfileData | null = null;
  if (fromSettings) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const db = getDb();
      const [profile] = await db
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, user.id))
        .limit(1);
      if (profile) {
        initialProfile = {
          name: profile.name,
          dob: profile.dob,
          gender: profile.gender,
          heightCm: profile.heightCm,
          currentWeightKg: profile.currentWeightKg,
          goal: profile.goal,
          activityLevel: profile.activityLevel,
          dietType: profile.dietType,
          targets: profile.targets as InitialProfileData["targets"],
        };
      }
    }
  }

  return <OnboardingForm fromSettings={fromSettings} initialProfile={initialProfile} />;
}
