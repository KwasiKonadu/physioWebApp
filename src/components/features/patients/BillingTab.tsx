"use client";
// Patient profile: billing tab.

import { formatDate, formatMoney } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { useUIStore } from "@/stores/app-store";
import { DataTable } from "@/components/molecules/data-table";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AtomIcon } from "@/components/atoms/icon";
import { AssignPackageDialog } from "../billing/AssignPackageDialog";
import { PackageBalanceNotice } from "./PackageBalanceNotice";
import { PaymentArrangementPanel, type PanelProps } from "./PaymentArrangementPanel";
import type { PatientBundle } from "./hooks";

export function BillingTab({ bundle, name, navigate, patient, patientId, canBill, canManagePatients, removeInsurance, setInsuranceDialog, onChangeArrangement }: { bundle: PatientBundle; name: string; navigate: ReturnType<typeof useUIStore.getState>["navigate"]; patient: PatientBundle["patient"]; patientId: string; canBill: boolean; canManagePatients: boolean; removeInsurance: PanelProps["removeInsurance"]; setInsuranceDialog: PanelProps["setInsuranceDialog"]; onChangeArrangement: () => void }) {
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const showPackages = bundle.patientPackages.length > 0 || patient.paymentArrangement === "PACKAGE";
  const closeAssign = () => {
    setAssignOpen(false);
    void qc.invalidateQueries({ queryKey: ["patient", patientId] });
    void qc.invalidateQueries({ queryKey: ["package-balance"] });
  };
  return (
    <TabsContent value="billing" className="space-y-4">
      <PaymentArrangementPanel
        bundle={bundle} patientId={patientId} canBill={canBill} canManagePatients={canManagePatients}
        navigate={navigate} onChangeArrangement={onChangeArrangement}
        removeInsurance={removeInsurance} setInsuranceDialog={setInsuranceDialog}
      />
      <SectionCard title="Invoices" icon="Receipt" description="Latest 20 invoices — click a row to open it in the billing module.">
        <DataTable
          bare
          maxHeight="max-h-105"
          minWidth="min-w-160"
          rows={bundle.invoices}
          rowKey={(inv) => inv.id}
          onRowClick={(inv) => navigate("billing", { patientId, invoiceId: inv.id, focusTab: "invoices" })}
          empty={<EmptyState icon="Receipt" title="No invoices" description="Invoices issued for this patient will appear here." />}
          columns={[
            { id: "invoice", header: "Invoice", cell: (inv) => <span className="font-mono text-xs">{inv.invoiceNumber}</span> },
            { id: "issued", header: "Issued", cell: (inv) => <span className="text-sm">{formatDate(inv.issuedAt)}</span> },
            { id: "arrangement", header: "Arrangement", cell: (inv) => <span className="text-sm">{labelize(inv.arrangement)}</span> },
            { id: "total", header: "Total", align: "right", cell: (inv) => <span className="text-sm">{formatMoney(inv.totalCents)}</span> },
            { id: "paid", header: "Paid", align: "right", cell: (inv) => <span className="text-sm">{formatMoney(inv.paidCents)}</span> },
            { id: "status", header: "Status", cell: (inv) => <StatusBadge status={inv.status} /> },
          ]}
        />
      </SectionCard>

      {showPackages ? (
        <SectionCard
          title="Session packages"
          icon="Package"
          actions={canBill ? (
            <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> Add package
            </Button>
          ) : undefined}
        >
          <PackageBalanceNotice patientId={patientId} className="mb-3" />
          {bundle.patientPackages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packages assigned yet.{canBill ? " Use “Add package” to sell one to this patient." : ""}</p>
          ) : null}
          <ul className="space-y-2.5">
            {bundle.patientPackages.map((pp) => (
              <li key={pp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{pp.package.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pp.usedSessions}/{pp.totalSessions} sessions used · expires {formatDate(pp.expiryDate)} · {formatMoney(pp.amountPaidCents)}
                  </p>
                </div>
                <StatusBadge status={pp.status} />
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
      <AssignPackageDialog open={assignOpen} onClose={closeAssign} prefillPatientId={patientId} />
    </TabsContent>
  );
}
