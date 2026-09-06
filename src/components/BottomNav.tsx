import Link from "next/link";

/** Consistent 1.5px-stroke icon set — no emoji (UX_AUDIT G3/G4). */
function Icon({ name, className }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />,
    log: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    history: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </>
    ),
    workout: (
      <>
        <path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10" />
      </>
    ),
    coach: (
      <>
        <path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3Z" />
        <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

const TABS = [
  { href: "/home", label: "Today", icon: "home" },
  { href: "/log", label: "Eat", icon: "log" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/workout", label: "Train", icon: "workout" },
  { href: "/coach", label: "Coach", icon: "coach" },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-950/90 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => {
          const isActive = active === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-emerald-600" : "text-neutral-400 active:text-neutral-600"
              }`}
            >
              <Icon name={t.icon} className={`h-5 w-5 ${isActive ? "" : "opacity-80"}`} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
