"use client";
// Dashboard chart building blocks (recharts). Palette validated for colour-blind separation:
// blue #2f7fd0 · teal #0e9f8a · amber #e08a1e — always paired with a legend / direct values.
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { labelize } from "@/lib/constants";

export const VIZ = { blue: "#2f7fd0", teal: "#0e9f8a", amber: "#e08a1e", grid: "#e8ecf1", axis: "#64748b" };

export interface TrendPoint {
  day: string; date: string; appointments: number; sessions: number; revenue: number; newPatients: number;
}

function TooltipBox({ active, payload, label, format }: {
  active?: boolean; label?: string;
  payload?: { name?: string; value?: number | string; color?: string }[];
  format?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-700">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}</span>
          <span className="ml-auto pl-3 font-semibold text-slate-800">
            {format ? format(Number(p.value), String(p.name)) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

const axisProps = { tick: { fontSize: 11, fill: VIZ.axis }, axisLine: false, tickLine: false } as const;

/** Single-series area chart with a soft gradient (used for revenue). */
export function RevenueAreaChart({ data, symbol }: { data: TrendPoint[]; symbol: string }) {
  const interval = data.length > 14 ? Math.ceil(data.length / 7) - 1 : 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIZ.teal} stopOpacity={0.28} />
            <stop offset="100%" stopColor={VIZ.teal} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={VIZ.grid} />
        <XAxis dataKey="day" interval={interval} {...axisProps} />
        <YAxis width={48} {...axisProps} tickFormatter={(v) => `${symbol}${Number(v).toLocaleString()}`} />
        <Tooltip content={<TooltipBox format={(v) => `${symbol}${v.toLocaleString()}`} />} cursor={{ stroke: VIZ.grid }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={VIZ.teal} strokeWidth={2} fill="url(#revFill)"
          dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Appointments (area) vs completed sessions (line) over the same window. */
export function ActivityAreaChart({ data }: { data: TrendPoint[] }) {
  const interval = data.length > 14 ? Math.ceil(data.length / 7) - 1 : 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="apptFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIZ.blue} stopOpacity={0.22} />
            <stop offset="100%" stopColor={VIZ.blue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={VIZ.grid} />
        <XAxis dataKey="day" interval={interval} {...axisProps} />
        <YAxis allowDecimals={false} width={44} {...axisProps} />
        <Tooltip content={<TooltipBox />} cursor={{ stroke: VIZ.grid }} />
        <Area type="monotone" dataKey="appointments" name="Appointments" stroke={VIZ.blue} strokeWidth={2} fill="url(#apptFill)"
          dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
        <Area type="monotone" dataKey="sessions" name="Sessions completed" stroke={VIZ.teal} strokeWidth={2} fill="none"
          dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut with a centre total; legend with values is rendered by the caller. */
export function Donut({ slices, centre, sub }: {
  slices: { name: string; value: number; color: string }[]; centre: string; sub: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const data = total > 0 ? slices : [{ name: "None", value: 1, color: "#eef1f5" }];
  return (
    <div className="relative mx-auto h-36 w-36">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={46} outerRadius={64} paddingAngle={total > 0 ? 2 : 0}
            stroke="none" cornerRadius={4}>
            {data.map((s) => <Cell key={s.name} fill={s.color} />)}
          </Pie>
          {total > 0 ? <Tooltip content={<TooltipBox format={(v) => v.toLocaleString()} />} /> : null}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-base font-bold leading-tight text-navy-800">{centre}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

/** Horizontal bar list: label, bar, count. Single hue; the number is always visible. */
export function StatusBars({ rows }: { rows: { status: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((s, r) => s + r.count, 0) || 1;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.status}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">{labelize(r.status)}</span>
            <span className="text-slate-500">
              <span className="font-semibold text-slate-800">{r.count}</span> · {Math.round((r.count / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: VIZ.blue }} />
          </div>
        </div>
      ))}
    </div>
  );
}
