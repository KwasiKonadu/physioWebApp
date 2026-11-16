// Calendar date helpers and range labels for the appointments page.
import { addDays, formatDate } from "@/lib/format";

export type View = "day" | "week" | "month";
export const ALL = "all";

export function anchorDateOf(anchor: string): Date {
  return new Date(`${anchor}T00:00:00`);
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
}

export function rangeLabel(view: View, anchor: string): string {
  const d = anchorDateOf(anchor);
  if (view === "day") return formatDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "week") {
    const mon = mondayOf(d);
    const sun = addDays(mon, 6);
    return `${formatDate(mon, { day: "numeric", month: "short" })} – ${formatDate(sun, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** Label for the "jump to today" button, relative to the period being viewed. */
export function relativeLabel(view: View, anchor: string): string {
  const MS_DAY = 86_400_000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = anchorDateOf(anchor);
  const yearSuffix = d.getFullYear() !== today.getFullYear();

  if (view === "day") {
    const diff = Math.round((d.getTime() - today.getTime()) / MS_DAY);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    // within a week: the weekday name is unambiguous; further out it would repeat, so show the date
    if (Math.abs(diff) <= 6) return d.toLocaleDateString("en-GB", { weekday: "long" });
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(yearSuffix ? { year: "numeric" } : {}) });
  }

  if (view === "week") {
    const mon = mondayOf(d);
    const diff = Math.round((mon.getTime() - mondayOf(today).getTime()) / (7 * MS_DAY));
    if (diff === 0) return "This week";
    if (diff === 1) return "Next week";
    if (diff === -1) return "Last week";
    const sun = addDays(mon, 6);
    const f = (x: Date, withYear: boolean) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
    return `${f(mon, false)} – ${f(sun, yearSuffix || sun.getFullYear() !== today.getFullYear())}`;
  }

  const diff = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
  if (diff === 0) return "This month";
  if (diff === 1) return "Next month";
  if (diff === -1) return "Last month";
  // a month name stays unambiguous for a year; at 12 months away it would repeat, so add the year
  if (Math.abs(diff) <= 11) return d.toLocaleDateString("en-GB", { month: "long" });
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
