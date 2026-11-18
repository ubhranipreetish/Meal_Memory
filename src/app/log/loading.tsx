import { Mic, Camera, ArrowUpRight, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export default function LogLoading() {
  return (
    <AppShell
      active="/log"
      eyebrow={<span className="skeleton h-3 w-28" aria-hidden="true" />}
      aside="Your food journal"
      title="Eat. Log. Carry on."
      subtitle="A little less tracking. A little more living."
    >
      <div role="status" className="sr-only">
        Loading food journal...
      </div>
      <div className="section chips" aria-hidden="true">
        <span className="skeleton h-9 w-16 rounded-full" />
        <span className="skeleton h-9 w-24 rounded-full" />
      </div>

      {/* Meal slot chips */}
      <div className="section chips" aria-hidden="true">
        {["Breakfast", "Lunch", "Snacks", "Dinner"].map((m, i) => (
          <span key={m} className={`chip ${i === 1 ? "selected" : ""}`}>
            {m}
          </span>
        ))}
      </div>

      {/* Composer card */}
      <div className="composer" aria-hidden="true">
        <textarea
          aria-label="What did you eat?"
          placeholder={'What did you eat?\ne.g. "2 aloo parathas and a glass of milk"'}
          disabled
        />
        <div className="row between flex-wrap">
          <div className="row flex-wrap">
            <button type="button" className="icon" disabled aria-label="Record voice">
              <Mic size={18} />
            </button>
            <button type="button" className="icon" disabled aria-label="Take photo">
              <Camera size={18} />
            </button>
            <button type="button" className="icon" disabled aria-label="Add manually">
              <Plus size={18} />
            </button>
          </div>
          <button className="primary ml-auto" disabled>
            Log meal <ArrowUpRight size={18} />
          </button>
        </div>
      </div>

      {/* Meal journal feed skeleton */}
      <section className="section" aria-label="Meal journal" aria-hidden="true">
        <div className="row between">
          <h2>Meal journal</h2>
          <span className="skeleton h-6 w-24 rounded-full" />
        </div>
        <div className="card mt-3">
          <div className="row between">
            <div>
              <span className="skeleton h-3 w-16" />
              <span className="skeleton mt-2 h-3 w-14" />
            </div>
            <div className="text-right">
              <span className="skeleton h-4 w-20" />
              <span className="skeleton mt-1 h-3 w-16" />
            </div>
          </div>
          <span className="skeleton mt-3 h-10 w-full" />
        </div>
      </section>
    </AppShell>
  );
}
