"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "pg-theme";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return document.documentElement.classList.contains("light");
  } catch {
    return false;
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Light/dark switch. The class lives on <html> and is applied by the blocking
 * script in layout.tsx before first paint, so this only has to flip it —
 * reading from the DOM keeps the button honest if anything else changes it.
 */
export function ThemeToggle() {
  const light = useSyncExternalStore(subscribe, read, () => false);

  function toggle() {
    const next = !light;
    document.documentElement.classList.toggle("light", next);
    try {
      localStorage.setItem(KEY, next ? "light" : "dark");
    } catch {
      /* private mode — the choice just won't persist */
    }
    listeners.forEach((l) => l());
  }

  return (
    <button className="icon" onClick={toggle} aria-label={light ? "Use dark theme" : "Use light theme"}>
      {light ? <Moon size={19} /> : <Sun size={19} />}
    </button>
  );
}
