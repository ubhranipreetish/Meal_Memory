import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listReviews } from "@/lib/services/reviews";
import { AppShell } from "@/components/AppShell";
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
    <AppShell
      active="/home"
      eyebrow="REVIEWS"
      aside={<Link href="/progress" style={{ color: "inherit" }}>← Progress</Link>}
      title="Your week, in perspective."
      subtitle="Written from your own numbers, not a template."
    >
      <div className="row section">
        <GenerateReviewButton period="weekly" />
        <GenerateReviewButton period="monthly" />
      </div>
      {reviews.length === 0 && (
        <p className="small muted">No reviews yet — generate one, or they&rsquo;ll be created automatically each week.</p>
      )}
      <section className="section spaced">
        {reviews.map((r) => (
          <article key={r.id} className="card">
            <p className="eyebrow green">
              {r.periodStart} — {r.periodEnd}
            </p>
            <p className="small muted mt-1">{r.periodType}</p>
            <p className="mt-3 whitespace-pre-wrap">{r.narrative}</p>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
