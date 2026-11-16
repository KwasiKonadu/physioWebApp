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
import type { PatientBundle } from "./hooks";

export function BillingTab({ bundle, name, navigate, patient, patientId }: { bundle: PatientBundle; name: string; navigate: ReturnType<typeof useUIStore.getState>["navigate"]; patient: PatientBundle["patient"]; patientId: string }) {
  return (
    <TabsContent value="billing" className="space-y-4">
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

      {bundle.patientPackages.length > 0 ? (
        <SectionCard title="Session packages" icon="Package">
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
    </TabsContent>
  );
}
