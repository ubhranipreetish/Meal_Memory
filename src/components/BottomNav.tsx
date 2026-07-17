import Link from "next/link";

const TABS = [
  { href: "/home", label: "Home", icon: "◉" },
  { href: "/log", label: "Log", icon: "✎" },
  { href: "/history", label: "History", icon: "☰" },
  { href: "/workout", label: "Workout", icon: "▣" },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
              active === t.href ? "text-emerald-600" : "text-neutral-400"
            }`}
          >
            <span className="text-base leading-none">{t.icon}</span>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
