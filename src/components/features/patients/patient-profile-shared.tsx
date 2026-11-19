"use client";
// Patient profile: shared constants, draft types and small helpers.

export const PAYMENT_TONES: Record<string, string> = {
  PAYG: "bg-navy-50 text-navy-800 border-navy-200",
  PACKAGE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  INSURANCE: "bg-sky-50 text-sky-700 border-sky-200",
};

export interface ContactDraft { fullName: string; relationship: string; phone: string; altPhone: string; address: string; isNextOfKin: boolean }
export interface HistoryDraft { type: string; name: string; details: string }

export function EmptyStateCompact({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}
