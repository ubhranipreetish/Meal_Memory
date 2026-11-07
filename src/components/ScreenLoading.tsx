import { AppShell } from "@/components/AppShell";

export function ScreenLoading({ active }: { active: string }) {
  const home = active === "/home";
  const week = active === "/history";
  const eat = active === "/log";

  return (
    <AppShell active={active} className={home ? "home-dashboard" : undefined}>
      <div role="status" className="sr-only">Loading</div>
      <div aria-hidden="true" className="section">
        <span className="skeleton h-3 w-28" />
        <span className="skeleton mt-3 h-8 w-48 max-w-full" />
      </div>
      {home ? (
        <>
          <div className="card section home-energy" aria-hidden="true">
            <span className="skeleton h-3 w-28" />
            <div className="skeleton-gauge"><span className="skeleton h-10 w-28" /><span className="skeleton mt-2 h-3 w-20" /></div>
            <span className="skeleton h-4 w-32" />
          </div>
          <span aria-hidden="true" className="skeleton mt-4 h-12 w-full" />
          <div className="card section home-macros" aria-hidden="true"><SkeletonRows count={2} /></div>
        </>
      ) : (
        <div aria-hidden="true">
          {(eat || week) && (
            <div className="row section">
              {[0, 1, 2].map((index) => <span className="skeleton h-10 flex-1" key={index} />)}
            </div>
          )}
          <div className="card section">
            {week ? <span className="skeleton h-36 w-full" /> : <SkeletonRows count={eat ? 2 : 4} />}
          </div>
          <div className="card section"><SkeletonRows count={2} /></div>
        </div>
      )}
    </AppShell>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="spaced">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          <div className="row between"><span className="skeleton h-4 w-24" /><span className="skeleton h-4 w-12" /></div>
          <span className="skeleton mt-2 h-2 w-full" />
        </div>
      ))}
    </div>
  );
}
