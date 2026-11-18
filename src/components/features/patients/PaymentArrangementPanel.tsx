"use client";
// Patient billing tab: arrangement-specific panel (PAYG balance / insurance policy + claims).
import { formatDate, formatMoney } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { AtomIcon } from "@/components/atoms/icon";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { cn } from "@/lib/utils";
import type { InsuranceDto, PatientBundle } from "./hooks";


export interface PanelProps {
  bundle: PatientBundle;
  patientId: string;
  canBill: boolean;
  canManagePatients: boolean;
  navigate: (...args: any[]) => void;
  onChangeArrangement: () => void;
  removeInsurance: (id: string) => void;
  setInsuranceDialog: (v: { open: boolean; entry: InsuranceDto | null }) => void;
}

function Warn({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "emerald" }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
      tone === "amber" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50/60 text-emerald-900")}>
      <AtomIcon name={tone === "amber" ? "AlertTriangle" : "CheckCircle2"} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ChangeButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      <AtomIcon name="Repeat" className="mr-1.5 h-3.5 w-3.5" /> Change arrangement
    </Button>
  );
}

function policyState(ins: InsuranceDto): "ACTIVE" | "EXPIRING" | "EXPIRED" | "INACTIVE" {
  if (ins.status !== "ACTIVE") return "INACTIVE";
  if (!ins.validTo) return "ACTIVE";
  const days = (new Date(ins.validTo).getTime() - Date.now()) / 86_400_000;
  return days < 0 ? "EXPIRED" : days <= 30 ? "EXPIRING" : "ACTIVE";
}

export function PaymentArrangementPanel(props: PanelProps) {
  const { bundle, patientId, canBill, canManagePatients, navigate, onChangeArrangement } = props;
  const arrangement = bundle.patient.paymentArrangement;
  const leftoverPackages = bundle.stats.activePackages;
  const leftover = leftoverPackages > 0 && arrangement !== "PACKAGE"
    ? <Warn>This patient still has {leftoverPackages} active package{leftoverPackages > 1 ? "s" : ""} with unused sessions. Sessions are only deducted from packages while the arrangement is Package.</Warn>
    : null;

  if (arrangement === "PAYG") {
    const b = bundle.billing;
    return (
      <SectionCard
        title="Pay as you go"
        icon="Wallet"
        description="Each session is invoiced and paid individually"
        actions={<div className="flex items-center gap-2">
          {canBill ? <Button size="sm" variant="outline" onClick={() => navigate("billing", { patientId, focusTab: "invoices" })}><AtomIcon name="Receipt" className="mr-1.5 h-3.5 w-3.5" /> New invoice</Button> : null}
          {canManagePatients ? <ChangeButton onClick={onChangeArrangement} /> : null}
        </div>}
      >
        <div className="space-y-3">
          {b.outstandingCents > 0
            ? <Warn>Outstanding balance: <strong>{formatMoney(b.outstandingCents)}</strong> across {b.unpaidInvoices} unpaid invoice{b.unpaidInvoices > 1 ? "s" : ""}.</Warn>
            : <Warn tone="emerald">No outstanding balance.</Warn>}
          <DetailGrid cols={2}>
            <DetailRow label="Outstanding" value={formatMoney(b.outstandingCents)} />
            <DetailRow label="Unpaid invoices" value={String(b.unpaidInvoices)} />
            <DetailRow
              label="Last payment"
              value={b.lastPayment ? `${formatMoney(b.lastPayment.amountCents)} · ${labelize(b.lastPayment.method)} · ${formatDate(b.lastPayment.paidAt)}` : "No payments yet"}
            />
          </DetailGrid>
          {leftover}
          <p className="text-xs text-muted-foreground">Paying often? A session package is usually cheaper per visit — switch the arrangement to Package and add one.</p>
        </div>
      </SectionCard>
    );
  }

  if (arrangement === "INSURANCE") {
    const policies = bundle.insurances;
    const states = policies.map(policyState);
    const hasActive = states.some((s) => s === "ACTIVE" || s === "EXPIRING");
    const claims = bundle.invoices.filter((i) => i.claim);
    return (
      <SectionCard
        title="Insurance"
        icon="ShieldCheck"
        description="Policies and claims for this patient"
        actions={<div className="flex items-center gap-2">
          {canManagePatients ? <Button size="sm" variant="outline" onClick={() => props.setInsuranceDialog({ open: true, entry: null })}><AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add policy</Button> : null}
          {canManagePatients ? <ChangeButton onClick={onChangeArrangement} /> : null}
        </div>}
      >
        <div className="space-y-4">
          {!policies.length ? <Warn>This patient is set to Insurance but has no policy on file. Add one so invoices can be claimed.</Warn>
            : !hasActive ? <Warn>No valid policy — every policy is expired or inactive. Add or renew a policy.</Warn>
            : states.includes("EXPIRING") && !states.includes("ACTIVE") ? <Warn>The current policy expires soon. Confirm renewal with the patient.</Warn> : null}

          <ul className="space-y-3">
            {policies.map((ins, i) => (
              <li key={ins.id} className="rounded-lg border px-3 py-3">
                <div className="toolbar-row">
                  <p className="text-sm font-medium">
                    {ins.provider?.name || "Unknown provider"}
                    {ins.provider?.coveragePercent != null ? <span className="ml-2 text-xs font-normal text-muted-foreground">{ins.provider.coveragePercent}% cover</span> : null}
                  </p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={states[i] === "EXPIRED" ? "EXPIRED" : ins.status} />
                    {states[i] === "EXPIRING" ? <span className="text-xs text-amber-700">expires soon</span> : null}
                    {canManagePatients ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => props.setInsuranceDialog({ open: true, entry: ins })}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:bg-rose-50 hover:text-destructive" onClick={() => props.removeInsurance(ins.id)}>Remove</Button>
                      </>
                    ) : null}
                  </div>
                </div>
                <DetailGrid cols={2}>
                  <DetailRow label="Membership" value={<span className="font-mono text-xs">{ins.membershipNumber}</span>} />
                  <DetailRow label="Policy" value={ins.policyNumber} />
                  <DetailRow label="Valid" value={ins.validFrom || ins.validTo ? `${formatDate(ins.validFrom)} — ${formatDate(ins.validTo)}` : undefined} />
                  <DetailRow label="Principal member" value={ins.principalMember ? `${ins.principalMember}${ins.relationshipToPrincipal ? ` (${labelize(ins.relationshipToPrincipal)})` : ""}` : undefined} />
                </DetailGrid>
              </li>
            ))}
          </ul>

          <div>
            <p className="mb-2 text-sm font-medium">Claims</p>
            {claims.length === 0 ? <p className="text-sm text-muted-foreground">No claims raised yet.</p> : (
              <ul className="space-y-2">
                {claims.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{inv.claim!.claimNumber} <span className="font-mono text-xs text-muted-foreground">· {inv.invoiceNumber}</span></p>
                      <p className="text-xs text-muted-foreground">Claimed {formatMoney(inv.claim!.claimedCents)} · Approved {formatMoney(inv.claim!.approvedCents)}</p>
                    </div>
                    <StatusBadge status={inv.claim!.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {leftover}
        </div>
      </SectionCard>
    );
  }
  return null;
}
