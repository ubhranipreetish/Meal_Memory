"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

const motionPreference = "(prefers-reduced-motion: no-preference)";
const poster = "/demo/meal-memory-story-poster.webp";

function subscribe(onChange: () => void) {
  const preference = window.matchMedia(motionPreference);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}

function allowsMotion() {
  return window.matchMedia(motionPreference).matches;
}

export function LandingHero() {
  const animate = useSyncExternalStore(subscribe, allowsMotion, () => false);

  return (
    <div
      className="public-landing-hero"
      role="img"
      aria-label="Meal Memory demonstrates logging butter chicken by voice and a plate of dosa, idli, and chutney by photo."
    >
      {animate ? (
        <video autoPlay loop muted playsInline poster={poster} aria-hidden="true">
          <source src="/demo/meal-memory-story.mp4" type="video/mp4" />
          <track src="/demo/meal-memory-story.vtt" kind="captions" srcLang="en" label="English and Hinglish" />
        </video>
      ) : (
        <Image src={poster} alt="" width={720} height={900} unoptimized />
      )}
    </div>
  );
}
