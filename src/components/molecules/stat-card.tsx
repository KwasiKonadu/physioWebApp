"use client";
// MOLECULE: KPI stat card used on dashboards and module overviews.
// Design: tinted card, large soft circle bleeding off the bottom-right corner with an oversized, tilted icon.
import { AtomIcon } from "@/components/atoms/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon?: string;
  hint?: string;
  tone?: "navy" | "teal" | "amber" | "rose" | "sky" | "emerald";
  loading?: boolean;
  onClick?: () => void;
  /** change versus a comparison period; pct null = "new" (previous value was zero); good null = neutral */
  trend?: StatTrend;
}

export interface StatTrend { pct: number | null; good: boolean | null; title?: string }

/** Compare a value with the previous period. Returns undefined when there is nothing to compare. */
export function makeTrend(cur: number, prev: number | undefined, opts?: { lowerIsBetter?: boolean; neutral?: boolean; title?: string }): StatTrend | undefined {
  if (prev === undefined || !Number.isFinite(prev) || !Number.isFinite(cur)) return undefined;
  if (prev === 0 && cur === 0) return { pct: 0, good: null, title: opts?.title };
  const pct = prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 100);
  const up = cur > prev;
  const good = opts?.neutral || cur === prev ? null : opts?.lowerIsBetter ? !up : up;
  return { pct, good, title: opts?.title };
}

function TrendChip({ trend }: { trend: StatTrend }) {
  const flat = trend.pct === 0;
  const up = trend.pct === null ? true : trend.pct > 0;
  const tone = flat || trend.good === null ? "text-slate-600" : trend.good ? "text-emerald-700" : "text-rose-700";
  return (
    <span
      title={trend.title}
      className={cn("absolute right-3 top-2.5 flex items-center gap-0.5 rounded-full bg-white/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm", tone)}
    >
      {flat ? <AtomIcon name="Minus" className="h-3 w-3" /> : <AtomIcon name={up ? "TrendingUp" : "TrendingDown"} className="h-3 w-3" />}
      {trend.pct === null ? "New" : flat ? "0%" : `${Math.abs(trend.pct)}%`}
    </span>
  );
}

// card background + ink colour (the circle and icon inherit the ink via currentColor)
const toneMap: Record<string, string> = {
  navy: "bg-navy-50 text-navy-900",
  teal: "bg-teal-50 text-teal-900",
  amber: "bg-amber-50 text-amber-900",
  rose: "bg-rose-50 text-rose-900",
  sky: "bg-sky-50 text-sky-900",
  emerald: "bg-emerald-50 text-emerald-900",
};

export function StatCard({ label, value, icon = "Activity", hint, tone = "navy", loading, onClick, trend }: StatCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-current/10 px-4 py-3 shadow-sm",
        toneMap[tone],
        onClick && "cursor-pointer transition-shadow hover:shadow-md"
      )}
      onClick={onClick}
    >
      {/* backdrop circle, bleeds off the bottom-right corner */}
      <div aria-hidden className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-current opacity-[0.06]" />
      {/* icon, centred on the circle */}
      <AtomIcon
        name={icon}
        className="pointer-events-none absolute -bottom-1 -right-1 h-14 w-14 rotate-[-8deg] stroke-[1.5] opacity-30"
      />

      {trend && !loading ? <TrendChip trend={trend} /> : null}
      <p className={cn("relative mb-0.5 truncate text-xs opacity-65", trend && "pr-14")}>{label}</p>
      {loading ? (
        <Skeleton className="relative h-6 w-20" />
      ) : (
        <p className="relative truncate text-xl font-medium leading-tight">{value}</p>
      )}
      {hint && !loading ? <p className="relative mt-0.5 truncate text-[11px] opacity-50">{hint}</p> : null}
    </div>
  );
}
