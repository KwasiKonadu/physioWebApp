"use client";
// Bar chart for the reports page: rounded bars, soft hover band, a tooltip card that matches the donuts,
// and a legend that doubles as a series toggle (hovering a legend chip highlights that series).
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

export interface BarSeries { key: string; name: string; color: string }

const AXIS = "#64748b";
const GRID = "#e8ecf1";

function TooltipCard({ active, payload, label, format, hidden }: {
  active?: boolean; label?: string;
  payload?: { name?: string; dataKey?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> }[];
  format: (v: number) => string;
  hidden: string[];
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => !hidden.includes(String(p.dataKey)));
  if (!rows.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-slate-700">{label}</p>
      {rows.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: (p.payload?.__color as string) || p.color }} />
          <span className="text-slate-500">{p.name}</span>
          <span className="ml-auto pl-4 font-semibold tabular-nums text-slate-900">{format(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function ReportBarChart({
  data, xKey, series, formatValue = (v) => v.toLocaleString(), formatAxis, colorByPoint, height = 288, xInterval = 0, yWidth = 36, defaultHidden = [],
}: {
  data: Record<string, unknown>[];
  xKey: string;
  series: BarSeries[];
  formatValue?: (v: number) => string;
  formatAxis?: (v: number) => string;
  /** single-series charts only: a colour per bar */
  colorByPoint?: string[];
  height?: number;
  xInterval?: number;
  yWidth?: number;
  /** series keys that start switched off (the legend chip turns them on) */
  defaultHidden?: string[];
}) {
  const [hidden, setHidden] = useState<string[]>(defaultHidden);
  const [focus, setFocus] = useState<string | null>(null);
  const multi = series.length > 1;
  const totals = Object.fromEntries(series.map((s) => [s.key, data.reduce((sum, d) => sum + (Number(d[s.key]) || 0), 0)]));
  const rows = colorByPoint ? data.map((d, i) => ({ ...d, __color: colorByPoint[i % colorByPoint.length] })) : data;

  const toggle = (key: string) =>
    setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : h.length === series.length - 1 ? h : [...h, key]));

  return (
    <div>
      {multi ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {series.map((s) => {
            const off = hidden.includes(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
                onMouseEnter={() => setFocus(s.key)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(s.key)}
                onBlur={() => setFocus(null)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors hover:bg-slate-50",
                  off ? "border-dashed text-muted-foreground" : "text-slate-700",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: off ? "#cbd5e1" : s.color }} />
                <span className={cn(off && "line-through")}>{s.name}</span>
                <span className="font-semibold tabular-nums text-slate-900">{formatValue(totals[s.key])}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={3}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} interval={xInterval} tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
            <YAxis
              allowDecimals={false}
              width={yWidth}
              tick={{ fontSize: 11, fill: AXIS }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatAxis}
            />
            <Tooltip
              cursor={{ fill: "#94a3b8", fillOpacity: 0.05, radius: 6 }}
              content={<TooltipCard format={formatValue} hidden={hidden} />}
              isAnimationActive={false}
            />
            {series.filter((s) => !hidden.includes(s.key)).map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                radius={[6, 6, 0, 0]}
                maxBarSize={44}
                fillOpacity={focus && focus !== s.key ? 0.25 : 1}
                animationDuration={500}
              >
                {colorByPoint ? rows.map((_, i) => <Cell key={i} fill={colorByPoint[i % colorByPoint.length]} />) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
