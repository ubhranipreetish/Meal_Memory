import { notFound } from "next/navigation";
import { PREVIEW_SCREENS } from "../page";
import { OnboardingForm } from "@/app/onboarding/OnboardingForm";
import { PreviewClient } from "../PreviewClient";

/**
 * Catch-all so the prototype's own links work as a browsable set:
 * /preview/log, /preview/history, and /preview/food/2 for a food detail.
 */
export default async function PreviewScreenPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const screen = slug[0];
  if (!PREVIEW_SCREENS.some((s) => s.slug === screen)) notFound();
  if (screen === "onboarding") return <OnboardingForm previewOnly />;
  return <PreviewClient screen={screen} />;
}
