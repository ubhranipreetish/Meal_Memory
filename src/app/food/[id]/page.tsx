import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFood } from "@/lib/services/history";
import { BottomNav } from "@/components/BottomNav";
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-5 px-5 pb-24 pt-8">
      <div className="flex items-center justify-between">
        <Link href="/history" className="text-sm text-neutral-500 underline underline-offset-4">← History</Link>
      </div>

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

      <section className="rounded-2xl border border-neutral-200 p-4 text-sm dark:border-neutral-800">
        <h2 className="mb-2 font-medium">About this food</h2>
        <dl className="flex flex-col gap-1.5 text-neutral-500">
          <div className="flex justify-between"><dt>Times logged</dt><dd>{food.timesLogged}</dd></div>
          <div className="flex justify-between"><dt>Last logged</dt><dd>{food.lastLoggedAt ? new Date(food.lastLoggedAt).toLocaleDateString() : "—"}</dd></div>
          <div className="flex justify-between"><dt>Source</dt><dd>{food.source === "user_entered" ? "You" : food.source === "llm_estimate" ? `AI estimate${food.confidence ? ` (${Math.round(food.confidence * 100)}%)` : ""}` : food.source}</dd></div>
          {food.assumptions && <div className="flex justify-between gap-4"><dt>Assumed</dt><dd className="text-right">{food.assumptions}</dd></div>}
        </dl>
        {food.aliases.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs uppercase tracking-wide text-neutral-400">Also known as</h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {food.aliases.map((a) => (
                <span key={a} className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-500 dark:border-neutral-700">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-neutral-400">
        Editing values here only affects future logs — your past meals keep the values they were logged with.
      </p>
      <BottomNav active="/history" />
    </main>
  );
}
