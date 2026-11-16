"use client";
// Subtotal / discount / insurance cover / total summary of the new-invoice builder.

import { formatMoney } from "@/lib/format";

export function InvoiceTotals({ arrangement, subtotalCents, discountCents, coveredCents, totalCents, patientDue }: {
  arrangement: string;
  subtotalCents: number;
  discountCents: number;
  coveredCents: number;
  totalCents: number;
  patientDue: number;
}) {
  return (
  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(subtotalCents)}</span></div>
    {discountCents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-rose-600">-{formatMoney(discountCents)}</span></div>}
    {arrangement === "INSURANCE" && coveredCents > 0 && (
      <div className="flex justify-between"><span className="text-muted-foreground">Insurance covers</span><span className="tabular-nums text-sky-700">-{formatMoney(coveredCents)}</span></div>
    )}
    <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
      <span>{arrangement === "INSURANCE" ? "Patient pays" : "Total"}</span>
      <span className="tabular-nums">{formatMoney(arrangement === "INSURANCE" ? patientDue : totalCents)}</span>
    </div>
  </div>
  );
}
