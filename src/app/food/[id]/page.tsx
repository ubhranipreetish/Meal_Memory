import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFood } from "@/lib/services/history";
import { AppShell } from "@/components/AppShell";
import { FoodEditor } from "./FoodEditor";

export const dynamic = "force-dynamic";

export default async function FoodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const food = await getFood(user.id, id);
  if (!food) notFound();

  return (
    <AppShell
      active="/settings"
      eyebrow="YOUR FOOD"
      aside={<Link href="/settings#saved-foods" style={{ color: "inherit" }}>← Saved foods</Link>}
      title="Your food, your numbers."
      subtitle="Edit anything — you're the authority on what you eat."
    >
      <FoodEditor
        food={{
          id: food.id,
          name: food.name,
          unit: food.unit,
          servingQty: food.servingQty,
          kcal: food.kcal,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatG: food.fatG,
          isFavorite: food.isFavorite,
        }}
      />

      <section className="card section">
        <h2>About this food</h2>
        <div className="mt-3">
          <div className="row between small">
            <span className="muted">Times logged</span>
            <span>{food.timesLogged}</span>
          </div>
          <div className="row between small mt-2">
            <span className="muted">Last logged</span>
            <span>{food.lastLoggedAt ? new Date(food.lastLoggedAt).toLocaleDateString() : "—"}</span>
          </div>
          <div className="row between small mt-2">
            <span className="muted">Source</span>
            <span>
              {food.source === "user_entered"
                ? "You"
                : food.source === "llm_estimate"
                  ? `AI estimate${food.confidence ? ` (${Math.round(food.confidence * 100)}%)` : ""}`
                  : food.source}
            </span>
          </div>
        </div>
        {food.assumptions && <p className="small muted mt-3">Assumed: {food.assumptions}</p>}
        {food.aliases.length > 0 && (
          <>
            <p className="eyebrow muted mt-4">ALSO KNOWN AS</p>
            <div className="chips mt-2">
              {food.aliases.map((a) => (
                <span className="chip" key={a}>
                  {a}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <p className="small muted section">
        Editing these values only affects future logs — your past meals keep the numbers they were logged with.
      </p>
    </AppShell>
  );
}
