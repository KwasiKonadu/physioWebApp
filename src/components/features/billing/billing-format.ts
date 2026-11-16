// Billing: name, money and date helpers.

import { fromCents, toCents, fullName, formatDate } from "@/lib/format";

export function patientName(p?: { firstName?: string | null; middleName?: string | null; lastName?: string | null; patientCode?: string | null } | null): string {
  if (!p) return "—";
  return fullName(p) || p.patientCode || "—";
}

// ---- Money-in-GHS number helpers for forms ----
export function centsToInput(cents?: number | null): string {
  return cents ? String(fromCents(cents)) : "";
}

export function inputToCents(v: string): number {
  if (!v || v.trim() === "") return 0;
  const n = toCents(parseFloat(v));
  return Number.isFinite(n) ? n : 0;
}

export function dateInputValue(d?: string | Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateLabel(d?: string | Date | null): string {
  return formatDate(d);
}

/** Simple horizontal mini-bar for arrangement revenue splits. */
