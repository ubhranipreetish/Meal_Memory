import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { LandingHero } from "./LandingHero";

export default function RootPage() {
  return (
    <main className="app app-backdrop public-landing">
      <header><Brand size={38} /></header>
      <section className="public-landing-layout" aria-labelledby="welcome-heading">
        <div className="public-landing-copy">
          <h1 id="welcome-heading">Welcome to <span>Meal Memory</span></h1>
          <p className="muted">Describe your meal or snap a photo. Track your calories and macros, and save the dishes you eat most.</p>
          <Link href="/login" className="primary">
            Sign in <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
        <LandingHero />
      </section>
    </main>
  );
}
