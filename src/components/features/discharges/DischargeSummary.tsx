"use client";
// Header summary card and outstanding-balance note.

import { formatDate, formatMoney, fullName, initials } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { useUIStore } from "@/stores/app-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import type { DischargeDetailResponse } from "../progress-reviews/types";

type Discharge = DischargeDetailResponse["discharge"];
type Baseline = DischargeDetailResponse["baseline"];

export function DischargeSummary({ discharge, baseline, isCompleted, outstanding }: { discharge: Discharge; baseline: Baseline; isCompleted: boolean; outstanding: Baseline["outstanding"] }) {
  const navigate = useUIStore((s) => s.navigate);
  return (
    <>
    {/* Summary card */}
    <div className="panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="h-12 w-12 rounded-xl">
            <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">{initials(fullName(discharge.patient))}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="min-w-0"><button type="button" title="Open patient profile" className="truncate text-left text-lg font-semibold tracking-tight transition-colors hover:text-teal-700 hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => navigate("patients", { patientId: discharge.patientId })}>{fullName(discharge.patient)}</button></h2>
              <span className="code-chip">{discharge.patient.patientCode}</span>
              <StatusBadge status={discharge.status} />
            </div>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{discharge.episode.title}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:shrink-0">
          {[
            { l: "Sessions", v: String(baseline.episode.totalCompletedSessions) },
            { l: "Discharge date", v: discharge.dischargeDate ? formatDate(discharge.dischargeDate) : "—" },
            { l: "Reason", v: discharge.reason || "—" },
            { l: "Episode", v: labelize(discharge.episode.status) },
          ].map((x) => (
            <div key={x.l} className="min-w-0">
              <dt className="label-caps-sm">{x.l}</dt>
              <dd className="truncate text-sm font-semibold">{x.v}</dd>
            </div>
          ))}
        </dl>
      </div>
      {isCompleted ? (
        <div className="mt-4 flex justify-end border-t pt-3 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <AtomIcon name="Printer" className="mr-2 h-4 w-4" />Print record
          </Button>
        </div>
      ) : null}
    </div>

    {/* Outstanding balance — informational only (never blocks discharge) */}
    <div className={`rounded-lg border px-4 py-3 ${outstanding.outstandingCents > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      <div className="toolbar-row">
        <p className="flex items-center gap-2 text-sm font-medium">
          <AtomIcon name="Receipt" className="h-4 w-4" />
          Outstanding balance: {formatMoney(outstanding.outstandingCents)}
          {outstanding.invoiceCount > 0 ? ` (${outstanding.invoiceCount} unpaid/partial invoice${outstanding.invoiceCount === 1 ? "" : "s"})` : " — no outstanding invoices"}
        </p>
        <p className="text-xs">Outstanding payments do not block discharge — the balance remains collectable via billing.</p>
      </div>
      {outstanding.invoices.length > 0 ? (
        <p className="mt-1.5 text-xs opacity-80">
          {outstanding.invoices.map((i) => `${i.invoiceNumber}: ${formatMoney(Math.max(0, i.totalCents - i.paidCents))} due`).join(" · ")}
        </p>
      ) : null}
    </div>
    </>
  );
}
