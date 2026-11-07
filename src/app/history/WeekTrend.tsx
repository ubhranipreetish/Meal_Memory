type TrendDay = { label: string; value: number | null };

export function WeekTrend({ title, unit, days }: { title: string; unit: string; days: TrendDay[] }) {
  const peak = Math.max(1, ...days.map(({ value }) => value ?? 0));
  const points = days.map(({ value }, index) => ({
    x: 16 + index * 48,
    y: value === null ? null : 98 - (value / peak) * 80,
  }));
  const segments = points.flatMap((point, index) => {
    const previous = points[index - 1];
    if (point.y === null || previous?.y == null) return [];
    return [`M ${previous.x} ${previous.y} L ${point.x} ${point.y}`];
  });
  const hasData = days.some(({ value }) => value !== null);

  return (
    <section className="card section">
      <h2>{title}</h2>
      <p className="small muted">Last 7 days · {unit}</p>
      {hasData ? (
        <>
          <svg className="mt-3 block w-full" viewBox="0 0 320 110" aria-hidden="true">
            {[18, 58, 98].map((y) => <line key={y} x1="16" x2="304" y1={y} y2={y} stroke="var(--pg-border)" strokeDasharray="4 4" />)}
            <path d={segments.join(" ")} fill="none" stroke="var(--pg-primary)" strokeWidth="3" strokeLinecap="round" />
            {points.map(({ x, y }, index) => y !== null && <circle key={x} cx={x} cy={y} r={index === points.length - 1 ? 5 : 4} fill="var(--pg-primary)" />)}
          </svg>
          <ul className="trend-labels">
            {days.map(({ label, value }) => (
              <li key={label}>
                <span className="muted">{label}</span>
                <strong aria-label={value === null ? "No meals logged" : `${Math.round(value)} ${unit}`}>
                  {value === null ? "—" : Math.round(value).toLocaleString("en-IN")}
                </strong>
              </li>
            ))}
          </ul>
        </>
      ) : <p className="small muted mt-3">Your trend will appear after you log a meal.</p>}
    </section>
  );
}
