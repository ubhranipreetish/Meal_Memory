"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, ChartNoAxesCombined, CircleGauge, Mic, SlidersHorizontal } from "lucide-react";
import { Brand } from "@/components/Brand";

const steps = [
  {
    title: "See what’s on your plate.",
    detail: "Track calories, protein, carbs, and fat against your daily targets. Start with the meals you already eat at home.",
    label: "TODAY",
    preview: "1,570 kcal",
    caption: "72 g protein · 182 g carbs · 70 g fat",
    Icon: CircleGauge,
  },
  {
    title: "Log meals in your own words.",
    detail: "Type what you ate, say it aloud, snap a photo, or enter the details yourself.",
    label: "MEAL LOG",
    preview: "2 aloo parathas and a bowl of dahi",
    caption: "Type · speak · photo · manual entry",
    Icon: Mic,
  },
  {
    title: "Make the estimate yours.",
    detail: "Review each dish before saving. Adjust the quantity, serving size, calories, or macros to match what you ate.",
    label: "REVIEW A DISH",
    preview: "Aloo paratha · 1 piece",
    caption: "300 kcal · 9 g protein per piece",
    Icon: SlidersHorizontal,
  },
  {
    title: "Let MealMemory remember.",
    detail: "Save your usual dishes and pick them from your saved foods next time. You can edit the details any time in Profile.",
    label: "SAVED FOODS",
    preview: "Dal, roti, and your usual chai",
    caption: "Filter by meal, choose a dish, then confirm.",
    Icon: Bookmark,
  },
  {
    title: "See how your week adds up.",
    detail: "Follow calorie and protein trends, compare meal categories, and open any day to revisit what you logged.",
    label: "THIS WEEK",
    preview: "Seven days at a glance",
    caption: "Daily meals · trends · top protein sources",
    Icon: ChartNoAxesCombined,
  },
];

export function WelcomeTour({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const { title, detail, label, preview, caption, Icon } = steps[step];
  const last = step === steps.length - 1;

  return (
    <main className="app app-backdrop welcome-tour">
      <header className="row between flex-wrap">
        <Brand size={36} />
        <button type="button" className="small muted welcome-skip" onClick={onFinish}>Skip to sign in</button>
      </header>

      <section className="welcome-content" aria-labelledby="welcome-heading">
        <div className="welcome-preview card" aria-label="Example">
          <div className="row between">
            <span className="eyebrow muted">{label}</span>
            <Icon size={26} className="green shrink-0" aria-hidden="true" />
          </div>
          <p className="welcome-example">{preview}</p>
          <p className="small muted">{caption}</p>
        </div>
        <p className="eyebrow green mt-6">Step {step + 1} of {steps.length}</p>
        <h1 id="welcome-heading" aria-live="polite" className="mt-2">{title}</h1>
        <p className="muted mt-2">{detail}</p>
      </section>

      <footer>
        <div className="welcome-progress" aria-hidden="true">
          {steps.map((item, index) => <span className={index <= step ? "filled" : ""} key={item.label} />)}
        </div>
        <div className="row mt-4">
          {step > 0 && (
            <button type="button" className="icon shrink-0" aria-label="Previous step" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          )}
          <button type="button" className="primary flex-1" onClick={() => last ? onFinish() : setStep(step + 1)}>
            {last ? "Continue to sign in" : "Next"} <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </footer>
    </main>
  );
}
