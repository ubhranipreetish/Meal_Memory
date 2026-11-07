import Link from "next/link";
import { UserRound } from "lucide-react";
import { Brand } from "@/components/Brand";
import { BottomNav } from "@/components/BottomNav";
import { formatAppDate } from "@/lib/time";

/**
 * The frame every screen sits in (ADR-011): the .app column, the brand header
 * and the bottom nav. Pages supply their own eyebrow/title/subtitle so the
 * header block reads consistently across the app.
 */
export function AppShell({
  active,
  className,
  eyebrow,
  aside,
  title,
  subtitle,
  children,
}: {
  /** BottomNav route to highlight, e.g. "/log". Omit on screens without a tab. */
  active?: string;
  className?: string;
  eyebrow?: React.ReactNode;
  /** Right-hand note on the eyebrow row (e.g. "Goal: Build muscle"). */
  aside?: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className={["app", "app-backdrop", active && "app-with-nav", className].filter(Boolean).join(" ")}>
      <header className="row between app-header">
        <Link href="/home" className="row" style={{ color: "inherit", textDecoration: "none" }}>
          <Brand />
        </Link>
        <div className="row">
          <Link href="/settings" prefetch aria-label="Profile" aria-current={active === "/settings" ? "page" : undefined} className="icon">
            <UserRound size={18} aria-hidden="true" />
          </Link>
        </div>
      </header>

      {(eyebrow || title || subtitle) && (
        <section className="section">
          {(eyebrow || aside) && (
            <div className="row between app-context">
              <span className="eyebrow muted">{eyebrow}</span>
              {aside && <span className="small green">{aside}</span>}
            </div>
          )}
          {title && <h1 className="mt-3">{title}</h1>}
          {subtitle && <p className="muted mt-1">{subtitle}</p>}
        </section>
      )}

      {children}
      {active && <BottomNav active={active} />}
    </main>
  );
}

/** Today's date in the header's voice: "SUNDAY, 7 SEPTEMBER". */
export function todayLabel(d = new Date()): string {
  return formatAppDate(d).toUpperCase();
}
