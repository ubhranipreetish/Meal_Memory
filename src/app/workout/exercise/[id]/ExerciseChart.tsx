"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  day: string;
  topWeight: number;
  hadPr: boolean;
}

export function ExerciseChart({ series }: { series: Point[] }) {
  const data = series.map((p) => ({
    ...p,
    label: new Date(p.day).toLocaleDateString([], { day: "numeric", month: "short" }),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.5}
            unit=" kg"
            domain={["dataMin - 2", "dataMax + 2"]}
          />
          <Tooltip
            formatter={(value) => [`${value} kg`, "Top set"]}
            labelStyle={{ color: "#111" }}
          />
          <Line
            type="monotone"
            dataKey="topWeight"
            stroke="#10b981"
            strokeWidth={2}
            dot={({ cx, cy, payload, index }) => (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={payload.hadPr ? 5 : 3}
                fill={payload.hadPr ? "#f59e0b" : "#10b981"}
              />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-neutral-400">
        <span className="text-amber-500">●</span> = session with a PR
      </p>
    </div>
  );
}
