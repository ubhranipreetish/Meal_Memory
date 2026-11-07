import Link from "next/link";
import { CalendarDays, House, Utensils } from "lucide-react";

const TABS = [
  { href: "/home", label: "Today", Icon: House },
  { href: "/log", label: "Eat", Icon: Utensils },
  { href: "/history", label: "This Week", Icon: CalendarDays },
];

export function BottomNav({ active }: { active: string }) {
  return (
    <nav className="nav" aria-label="Main navigation">
      {TABS.map(({ href, label, Icon }) => {
        const isActive = active === href;
        return (
          <Link key={href} href={href} aria-current={isActive ? "page" : undefined} className={isActive ? "active" : ""}>
            <Icon size={21} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
