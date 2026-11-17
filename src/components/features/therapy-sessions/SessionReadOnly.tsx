"use client";
// Read-only view of a finished session: documentation + package ledger.
import { DataTable } from "@/components/molecules/data-table";
import { formatDateTime } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SessionDetail, PackageTx } from "./session-form";

// ---- Read-only components ----
export function ReadOnlyDocumentation({ session, aside, hasAside }: { session: SessionDetail; aside: React.ReactNode; hasAside: boolean }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[3fr_2fr] *:min-w-0">
      <div className="flex min-w-0 flex-col gap-4">
      <SectionCard title="Interventions delivered" icon="Activity" description="What was actually delivered in this session" noPadding>
        <DataTable
          bare
          maxHeight="max-h-none"
          minWidth="min-w-0"
          rows={session.interventions}
          rowKey={(i) => i.id}
          empty={<p className="text-sm text-muted-foreground">No interventions recorded.</p>}
          columns={[
            { id: "n", header: "#", className: "w-10", cell: (_i, idx) => <span className="text-muted-foreground">{idx + 1}</span> },
            { id: "name", header: "Intervention", cell: (i) => <span className="font-medium">{i.name}</span> },
            { id: "details", header: "Details", cell: (i) => <span className="text-muted-foreground">{i.details || "—"}</span> },
          ]}
        />
      </SectionCard>

      <SectionCard title="Clinical notes" icon="Stethoscope" className="flex-1">
        <DetailGrid cols={1}>
          <DetailRow label="Treatment duration" value={session.durationMin ? `${session.durationMin} minutes` : "—"} />
          <DetailRow label="Patient response" value={session.patientResponse || "—"} />
          <DetailRow label="Clinical observations" value={session.observations || "—"} />
          <DetailRow label="Additional notes" value={<span className="whitespace-pre-wrap">{session.notes || "—"}</span>} />
          <DetailRow label="Therapist signature" value={session.therapistSignature ? <span className="italic">{session.therapistSignature}</span> : "—"} />
          <DetailRow label="Completed at" value={session.completedAt ? formatDateTime(session.completedAt) : "—"} />
        </DetailGrid>
      </SectionCard>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
      <SectionCard title="Vitals recorded" icon="HeartPulse" className={hasAside ? "" : "flex-1"}>
        {session.painLevel === null && !session.bloodPressure && !session.heartRate && !session.otherVitals ? (
          <p className="text-sm text-muted-foreground">No vitals were recorded for this session.</p>
        ) : (
          <DetailGrid cols={1}>
            <DetailRow label="Pain level" value={session.painLevel !== null && session.painLevel !== undefined ? `${session.painLevel}/10` : "—"} />
            <DetailRow label="Blood pressure" value={session.bloodPressure || "—"} />
            <DetailRow label="Heart rate" value={session.heartRate !== null && session.heartRate !== undefined ? `${session.heartRate} bpm` : "—"} />
            <DetailRow label="Other vitals" value={session.otherVitals || "—"} />
          </DetailGrid>
        )}
      </SectionCard>

        {hasAside ? <div className="flex flex-1 flex-col *:flex-1">{aside}</div> : null}
      </div>
    </div>
  );
}

export function PackageLedgerCard({ transactions, arrangement }: { transactions: PackageTx[]; arrangement?: string | null }) {
  if (arrangement !== "PACKAGE" && transactions.length === 0) return null;
  return (
    <SectionCard
      title="Package deduction ledger"
      icon="Wallet"
      description={transactions.length ? "Package transactions linked to this session" : "Package patient — no deduction was recorded for this session"}
    >
      {transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No package transactions linked to this session. Deductions happen automatically when a package-paying patient&apos;s session is completed.
        </p>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className={cn(
                    tx.type === "DEDUCTION" && "border-amber-200 bg-amber-50 text-amber-700",
                    tx.type === "REVERSAL" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    tx.type === "EXHAUSTED" && "border-rose-200 bg-rose-50 text-rose-700",
                  )}
                >
                  {labelize(tx.type)}
                </Badge>
                <div>
                  <p className="text-sm font-medium">
                    {tx.sessions > 0 ? `+${tx.sessions}` : tx.sessions} session{Math.abs(tx.sessions) === 1 ? "" : "s"}
                    {tx.patientPackage?.package?.name ? ` · ${tx.patientPackage.package.name}` : ""}
                  </p>
                  {tx.description ? <p className="text-xs text-muted-foreground">{tx.description}</p> : null}
                </div>
              </div>
              <div className="text-right">
                {tx.patientPackage ? (
                  <p className="text-xs text-muted-foreground">
                    {tx.patientPackage.usedSessions}/{tx.patientPackage.totalSessions} used
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
