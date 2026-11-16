// Reports: date-range helpers, CSV export and brand colours.
import type { RangePreset } from "./report-types";

export function parseYmd(v: string | null): Date | undefined {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
}

/** The equally long, day-aligned period immediately before `range`. */
export function previousRange(range: { from: string; to: string }): { from: string; to: string } {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  const prevTo = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1, 23, 59, 59, 999);
  const prevFrom = new Date(prevTo.getFullYear(), prevTo.getMonth(), prevTo.getDate() - (days - 1), 0, 0, 0, 0);
  return { from: prevFrom.toISOString(), to: prevTo.toISOString() };
}

export const TEAL = "#0e9f8a";
export const NAVY = "#123c66";

export function rangeFor(preset: RangePreset, customFrom?: Date, customTo?: Date): { from: string; to: string; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (preset === "today") return { from: start.toISOString(), to: end.toISOString(), label: "Today" };
  if (preset === "week") {
    const s = new Date(start);
    s.setDate(s.getDate() - 6);
    return { from: s.toISOString(), to: end.toISOString(), label: "This week" };
  }
  if (preset === "quarter") {
    const s = new Date(start);
    s.setDate(s.getDate() - 89);
    return { from: s.toISOString(), to: end.toISOString(), label: "Last 3 months" };
  }
  if (preset === "custom" && customFrom && customTo) {
    const s = new Date(customFrom);
    s.setHours(0, 0, 0, 0);
    const e = new Date(customTo);
    e.setHours(23, 59, 59, 999);
    return { from: s.toISOString(), to: e.toISOString(), label: "Custom range" };
  }
  const s = new Date(start);
  s.setDate(s.getDate() - 29);
  return { from: s.toISOString(), to: end.toISOString(), label: "This month" };
}

// ---- CSV helper ----
export function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
