"use client";
// Donut chart for the reports page: rounded slices, hover highlight shared between the ring and the legend,
// and a centre label that shows the total (or the hovered slice).
import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export const DONUT_COLORS = ["#123c66", "#0e9f8a", "#f59e0b", "#0ea5e9", "#ef4444", "#8b5cf6", "#14b8a6", "#64748b", "#a3e635"];

export interface DonutDatum { name: string; value: number }

export function ReportDonut({
  data, formatValue = (v) => v.toLocaleString(), formatName = (n) => n, centreLabel = "Total",
}: {
  data: DonutDatum[];
  formatValue?: (v: number) => string;
  formatName?: (n: string) => string;
  centreLabel?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const hovered = active !== null ? data[active] : null;
  const colorOf = (i: number) => DONUT_COLORS[i % DONUT_COLORS.length];

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      {/* ring */}
      <div className="relative h-52 w-52 shrink-0" onMouseLeave={() => setActive(null)}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={96}
              paddingAngle={3}
              cornerRadius={8}
              stroke="none"
              onMouseEnter={(_, i) => setActive(i)}
              isAnimationActive
              animationDuration={500}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={colorOf(i)}
                  fillOpacity={active === null || active === i ? 1 : 0.28}
                  style={{ transition: "fill-opacity 150ms ease", cursor: "pointer", outline: "none" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center">
          <p className="max-w-full truncate text-xl font-bold leading-tight text-navy-800">
            {formatValue(hovered ? hovered.value : total)}
          </p>
          <p className="max-w-full truncate text-[11px] text-muted-foreground">
            {hovered ? `${formatName(hovered.name)} · ${pct(hovered.value)}%` : centreLabel}
          </p>
        </div>
      </div>

      {/* legend */}
      <ul className="w-full min-w-0 flex-1 space-y-1">
        {data.map((d, i) => (
          <li
            key={d.name}
            tabIndex={0}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
              active === i ? "bg-slate-100" : "hover:bg-slate-50",
              active !== null && active !== i && "opacity-50",
            )}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(i) }} />
            <span className="min-w-0 flex-1 truncate text-slate-700">{formatName(d.name)}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatValue(d.value)}</span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct(d.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
