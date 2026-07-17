import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listReviews } from "@/lib/services/reviews";
import { BottomNav } from "@/components/BottomNav";
import { GenerateReviewButton } from "./GenerateReviewButton";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const reviews = await listReviews(user.id);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 px-5 pb-24 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <Link href="/progress" className="text-sm text-neutral-500 underline underline-offset-4">← Progress</Link>
      </div>
      <div className="flex gap-2">
        <GenerateReviewButton period="weekly" />
        <GenerateReviewButton period="monthly" />
      </div>
      {reviews.length === 0 && (
        <p className="text-sm text-neutral-400">No reviews yet — generate one, or they&apos;ll be created automatically each week.</p>
      )}
      {reviews.map((r) => (
        <article key={r.id} className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="flex justify-between text-xs text-neutral-500">
            <span className="font-medium uppercase">{r.periodType}</span>
            <span>{r.periodStart} → {r.periodEnd}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.narrative}</p>
        </article>
      ))}
      <BottomNav active="/home" />
    </main>
  );
}
