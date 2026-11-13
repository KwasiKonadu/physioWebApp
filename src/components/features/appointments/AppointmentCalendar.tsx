"use client";
// ============ Appointments calendar: custom day / week / month grids (no calendar lib) ============
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AtomIcon } from "@/components/atoms/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { minutesToTime, ymd } from "@/lib/format";
import { EmptyState } from "@/components/molecules/empty-state";
import { AppointmentDto, GRID_START_MIN, GRID_END_MIN, HOUR_HEIGHT, statusTone } from "./appointments-shared";

const PX_PER_MIN = HOUR_HEIGHT / 60;
const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarProps {
  view: "day" | "week" | "month";
  anchorDate: Date;
  items: AppointmentDto[];
  loading?: boolean;
  onSelect: (appt: AppointmentDto) => void;
  onDayClick: (dateYmd: string) => void;
}

// Greedy interval-colouring so overlapping bookings sit side-by-side instead of stacking
function layoutDay<T extends { startMin: number; endMin: number }>(items: T[]): { item: T; lane: number; lanes: number }[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number }[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const flush = () => {
    if (!cluster.length) return;
    const lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) out.push({ item: c.item, lane: c.lane, lanes });
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };
  for (const it of sorted) {
    if (cluster.length && it.startMin >= clusterEnd) flush();
    const laneEnds = new Map<number, number>();
    for (const c of cluster) laneEnds.set(c.lane, Math.max(laneEnds.get(c.lane) ?? 0, c.item.endMin));
    let lane = 0;
    while ((laneEnds.get(lane) ?? Number.NEGATIVE_INFINITY) > it.startMin) lane++;
    cluster.push({ item: it, lane });
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return out;
}

function groupByDate(items: AppointmentDto[]): Map<string, AppointmentDto[]> {
  const map = new Map<string, AppointmentDto[]>();
  for (const a of items) {
    const key = ymd(new Date(a.date));
    const arr = map.get(key) || [];
    arr.push(a);
    map.set(key, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.startMin - b.startMin);
  return map;
}

function patientName(a: AppointmentDto): string {
  return `${a.patient.firstName} ${a.patient.lastName}`;
}

function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ---------- shared block renderer ----------
function TimeBlock({ appt, lane, lanes, compact, onClick }: {
  appt: AppointmentDto;
  lane: number;
  lanes: number;
  compact?: boolean;
  onClick: () => void;
}) {
  const tone = statusTone(appt.status);
  const top = Math.max(0, (appt.startMin - GRID_START_MIN) * PX_PER_MIN);
  const height = Math.max(16, (Math.min(appt.endMin, GRID_END_MIN) - Math.max(appt.startMin, GRID_START_MIN)) * PX_PER_MIN - 2);
  const widthPct = 100 / lanes;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-left transition-colors",
        tone.block,
        compact ? "text-[10px] leading-tight" : "text-xs",
      )}
      style={{ top, height, left: `calc(${lane * widthPct}% + 1px)`, width: `calc(${widthPct}% - 3px)` }}
      title={`${minutesToTime(appt.startMin)}–${minutesToTime(appt.endMin)} · ${patientName(appt)}`}
    >
      <span className={cn("flex items-center gap-1 font-medium", tone.chip)}>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
        <span className="truncate">{minutesToTime(appt.startMin)}</span>
        {appt.walkIn ? <AtomIcon name="Zap" className="h-3 w-3 shrink-0" /> : null}
      </span>
      <span className={cn("block truncate font-medium", tone.chip)}>{compact ? appt.patient.lastName : patientName(appt)}</span>
      {!compact && appt.purpose ? <span className="block truncate text-[10px] opacity-70">{appt.purpose}</span> : null}
    </button>
  );
}

// ---------- day view ----------
function DayGrid({ anchorDate, items, loading, onSelect }: Omit<CalendarProps, "view" | "onDayClick">) {
  const anchorKey = ymd(anchorDate);
  const dayItems = useMemo(() => items.filter((a) => ymd(new Date(a.date)) === anchorKey), [items, anchorKey]);
  const laidOut = useMemo(() => layoutDay(dayItems), [dayItems]);
  const gridHeight = ((GRID_END_MIN - GRID_START_MIN) / 60) * HOUR_HEIGHT;
  const isToday = anchorKey === ymd(new Date());
  const showNowLine = isToday && nowMin() >= GRID_START_MIN && nowMin() <= GRID_END_MIN;

  if (loading) return <Skeleton className="h-[480px] w-full" />;
  if (dayItems.length === 0) {
    return <EmptyState icon="CalendarOff" title="No appointments scheduled" description="This day is clear — use “New appointment” to book a slot." />;
  }

  return (
    <div className="hidden md:block">
      <div className="flex">
        {/* time labels */}
        <div className="w-14 shrink-0 pt-6">
          {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
            <div key={i} className="relative" style={{ height: HOUR_HEIGHT }}>
              <span className="absolute -top-2 right-2 text-[10px] font-medium text-muted-foreground">
                {minutesToTime(GRID_START_MIN + i * 60)}
              </span>
            </div>
          ))}
        </div>
        <div className="relative flex-1 border-l border-border" style={{ height: gridHeight }}>
          {/* hour lines */}
          {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
            <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_HEIGHT }} />
          ))}
          {/* now indicator */}
          {showNowLine ? (
            <div className="absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMin() - GRID_START_MIN) * PX_PER_MIN }}>
              <div className="h-2 w-2 rounded-full bg-rose-500" />
              <div className="h-px flex-1 bg-rose-400" />
            </div>
          ) : null}
          {/* appointment blocks */}
          {laidOut.map(({ item, lane, lanes }) => (
            <TimeBlock key={item.id} appt={item} lane={lane} lanes={lanes} onClick={() => onSelect(item)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayListMobile({ anchorDate, items, loading, onSelect }: Omit<CalendarProps, "view" | "onDayClick">) {
  const anchorKey = ymd(anchorDate);
  const dayItems = useMemo(() => items.filter((a) => ymd(new Date(a.date)) === anchorKey), [items, anchorKey]);
  if (loading) return <div className="md:hidden"><Skeleton className="h-40 w-full" /></div>;
  if (dayItems.length === 0) return null; // empty state already rendered by DayGrid
  return (
    <div className="space-y-2 md:hidden">
      {dayItems.map((a) => {
        const tone = statusTone(a.status);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={cn("flex w-full items-center gap-3 rounded-lg border bg-white p-3 text-left shadow-sm", tone.block)}
          >
            <div className="shrink-0 text-center">
              <p className="text-sm font-semibold">{minutesToTime(a.startMin)}</p>
              <p className="text-[10px] text-muted-foreground">{minutesToTime(a.endMin)}</p>
            </div>
            <span className={cn("h-8 w-1 rounded-full", tone.dot)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{patientName(a)}</p>
              <p className="truncate text-xs text-muted-foreground">{a.purpose || "—"} · {a.therapist ? `${a.therapist.firstName} ${a.therapist.lastName}` : "—"}</p>
            </div>
            <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}

// ---------- week view ----------
function WeekGrid({ anchorDate, items, loading, onSelect }: Omit<CalendarProps, "view" | "onDayClick">) {
  const grouped = useMemo(() => groupByDate(items), [items]);
  const days = useMemo(() => {
    const d = new Date(anchorDate);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d);
      x.setDate(x.getDate() + i);
      return x;
    });
  }, [anchorDate]);
  const gridHeight = ((GRID_END_MIN - GRID_START_MIN) / 60) * HOUR_HEIGHT;
  const todayKey = ymd(new Date());

  if (loading) return <Skeleton className="h-[480px] w-full" />;

  return (
    <div className="overflow-x-auto custom-scrollbar">
      <div className="min-w-[860px]">
        {/* header */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className={cn("px-1 py-2 text-center", ymd(d) === todayKey && "bg-teal-50/60")}>
              <p className="text-[10px] font-medium uppercase text-muted-foreground">{WEEKDAY_HEADERS[(d.getDay() + 6) % 7]}</p>
              <p className={cn("text-sm font-semibold", ymd(d) === todayKey ? "text-teal-700" : "text-foreground")}>{d.getDate()}</p>
            </div>
          ))}
        </div>
        {/* body */}
        <div className="grid grid-cols-[52px_repeat(7,1fr)]">
          <div className="pt-6">
            {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
              <div key={i} className="relative" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute -top-2 right-1.5 text-[10px] font-medium text-muted-foreground">
                  {minutesToTime(GRID_START_MIN + i * 60)}
                </span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const dayItems = grouped.get(ymd(d)) || [];
            const laidOut = layoutDay(dayItems);
            return (
              <div key={d.toISOString()} className={cn("relative border-l border-border", ymd(d) === todayKey && "bg-teal-50/40")} style={{ height: gridHeight }}>
                {Array.from({ length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 }, (_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * HOUR_HEIGHT }} />
                ))}
                {laidOut.map(({ item, lane, lanes }) => (
                  <TimeBlock key={item.id} appt={item} lane={lane} lanes={lanes} compact onClick={() => onSelect(item)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- month view ----------
function MonthGrid({ anchorDate, items, loading, onSelect, onDayClick }: Omit<CalendarProps, "view">) {
  const grouped = useMemo(() => groupByDate(items), [items]);
  const cells = useMemo(() => {
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const start = new Date(first);
    const dow = first.getDay(); // 0 Sun
    start.setDate(first.getDate() + (dow === 0 ? -6 : 1 - dow));
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchorDate]);
  const todayKey = ymd(new Date());
  const anchorMonth = anchorDate.getMonth();

  if (loading) return <Skeleton className="h-[420px] w-full" />;

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="px-1 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const key = ymd(d);
          const dayItems = grouped.get(key) || [];
          const inMonth = d.getMonth() === anchorMonth;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDayClick(key)}
              className={cn(
                "min-h-[92px] border-b border-r border-border/70 p-1.5 text-left align-top transition-colors hover:bg-muted/50 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/30 text-muted-foreground",
                key === todayKey && "bg-teal-50/50",
              )}
            >
              <span className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                key === todayKey ? "bg-teal-600 text-white" : inMonth ? "text-foreground" : "text-muted-foreground",
              )}>
                {d.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayItems.slice(0, 3).map((a) => {
                  const tone = statusTone(a.status);
                  return (
                    <span
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onSelect(a); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onSelect(a); } }}
                      className={cn("flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-none", tone.block, tone.chip)}
                    >
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
                      <span className="truncate">{minutesToTime(a.startMin).replace(" ", "").toLowerCase()} {a.patient.lastName}</span>
                    </span>
                  );
                })}
                {dayItems.length > 3 ? (
                  <span className="block px-1 text-[10px] font-medium text-muted-foreground">+{dayItems.length - 3} more</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- export ----------
export function AppointmentCalendar(props: CalendarProps) {
  const { view } = props;
  if (view === "week") return <WeekGrid {...props} />;
  if (view === "month") return <MonthGrid {...props} />;
  return (
    <div className="space-y-4">
      <DayGrid {...props} />
      <DayListMobile {...props} />
    </div>
  );
}
