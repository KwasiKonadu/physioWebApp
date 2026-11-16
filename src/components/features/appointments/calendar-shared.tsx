"use client";
// Shared layout helpers and the appointment time block used by the calendar views.

import { cn } from "@/lib/utils";
import { AtomIcon } from "@/components/atoms/icon";

import { minutesToTime, ymd } from "@/lib/format";

import { AppointmentDto, GRID_START_MIN, GRID_END_MIN, HOUR_HEIGHT, statusTone } from "./appointments-shared";

export const PX_PER_MIN = HOUR_HEIGHT / 60;
export const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface CalendarProps {
  view: "day" | "week" | "month";
  anchorDate: Date;
  items: AppointmentDto[];
  loading?: boolean;
  onSelect: (appt: AppointmentDto) => void;
  onDayClick: (dateYmd: string) => void;
}

// Greedy interval-colouring so overlapping bookings sit side-by-side instead of stacking
export function layoutDay<T extends { startMin: number; endMin: number }>(items: T[]): { item: T; lane: number; lanes: number }[] {
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

export function groupByDate(items: AppointmentDto[]): Map<string, AppointmentDto[]> {
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

export function patientName(a: AppointmentDto): string {
  return `${a.patient.firstName} ${a.patient.lastName}`;
}

export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// ---------- shared block renderer ----------
export function TimeBlock({ appt, lane, lanes, compact, onClick }: {
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
  // a 30-minute slot is only ~26px tall: two text lines don't fit
  const short = height < 40;
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
      {short ? (
        // too short for two lines: time and name share one row
        <span className={cn("flex h-full items-center gap-1 font-medium", tone.chip)}>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
          <span className="shrink-0">{minutesToTime(appt.startMin)}</span>
          {appt.walkIn ? <AtomIcon name="Zap" className="h-3 w-3 shrink-0" /> : null}
          <span className="truncate">· {compact ? appt.patient.lastName : patientName(appt)}</span>
        </span>
      ) : (
        <>
          <span className={cn("flex items-center gap-1 font-medium", tone.chip)}>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
            <span className="truncate">{minutesToTime(appt.startMin)}</span>
            {appt.walkIn ? <AtomIcon name="Zap" className="h-3 w-3 shrink-0" /> : null}
          </span>
          <span className={cn("block truncate font-medium", tone.chip)}>{compact ? appt.patient.lastName : patientName(appt)}</span>
          {!compact && appt.purpose && height >= 56 ? <span className="block truncate text-[10px] opacity-70">{appt.purpose}</span> : null}
        </>
      )}
    </button>
  );
}
