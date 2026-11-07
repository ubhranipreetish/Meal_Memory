"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Droplets } from "lucide-react";
import { logWaterAction } from "./quickActions";

/** Water gets its own card: it's the one thing logged several times a day. */
export function WaterQuickAdd({ consumedMl, targetMl }: { consumedMl: number; targetMl: number }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  return (
    <section className="card section">
      <div className="row between">
        <div className="row">
          <Droplets className="green" size={22} />
          <h2>Water</h2>
        </div>
        <span>
          {(consumedMl / 1000).toFixed(2)} <span className="muted small">/ {(targetMl / 1000).toFixed(1)} L</span>
        </span>
      </div>
      <div className="bar">
        <i style={{ width: `${targetMl > 0 ? Math.min((consumedMl / targetMl) * 100, 100) : 0}%` }} />
      </div>
      <div className="water-actions mt-3">
        {[250, 500, 750].map((ml) => (
          <button
            key={ml}
            className="secondary small"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                if ((await logWaterAction(ml)).ok) router.refresh();
              })
            }
          >
            +{ml} ml
          </button>
        ))}
      </div>
    </section>
  );
}
