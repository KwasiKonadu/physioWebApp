"use client";
// Reports: financial report tab.

import { labelize } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { ReportDonut } from "./report-charts-lazy";
import { ReportBarChart } from "./report-charts-lazy";
import { DataTable } from "@/components/molecules/data-table";
import { StatCard, makeTrend } from "@/components/molecules/stat-card";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyStateCompact } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Progress } from "@/components/ui/progress";
import { FinancialReport } from "./report-types";
import { TEAL, NAVY } from "./report-utils";

export function FinancialTab({ report, prev, prevLabel }: { report: FinancialReport; prev?: FinancialReport; prevLabel: string }) {
  const s = report.stats;
  const arr = report.byArrangement;
  const arrData = [
    { name: "Pay-as-you-go", amountCents: arr.paygCents },
    { name: "Packages", amountCents: arr.packageCents },
    { name: "Insurance", amountCents: arr.insuranceCents },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Revenue collected" value={formatMoney(s.totalRevenueCents)} icon="Wallet" tone="teal" hint="payments in period" trend={makeTrend(s.totalRevenueCents, prev?.stats.totalRevenueCents, { title: `vs ${prevLabel}` })} />
        <StatCard label="Outstanding" value={formatMoney(s.outstandingCents)} icon="Receipt" tone="rose" hint={`${s.outstandingCount} invoices`} />
        <StatCard label="Refunds" value={formatMoney(s.refundsCents)} icon="Undo2" tone="amber" trend={makeTrend(s.refundsCents, prev?.stats.refundsCents, { lowerIsBetter: true, title: `vs ${prevLabel}` })} />
        <StatCard
          label="Claims outstanding"
          value={formatMoney(report.claims.outstandingCents)}
          icon="ShieldAlert"
          tone="sky"
          hint={`${report.claims.open} open claims`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Revenue by payment method" icon="CreditCard">
          {report.revenueByMethod.length === 0 ? (
            <EmptyStateCompact message="No payments in the selected period" />
          ) : (
            <ReportDonut
              data={report.revenueByMethod.map((r) => ({ name: String(r.method), value: Number(r.amountCents) }))}
              formatName={labelize} formatValue={formatMoney}
            />
          )}
        </SectionCard>

        <SectionCard title="Revenue by arrangement" icon="Layers">
          <ReportBarChart data={arrData} xKey="name" series={[{ key: "amountCents", name: "Revenue", color: NAVY }]} colorByPoint={[NAVY, TEAL, "#0ea5e9"]} formatValue={formatMoney} formatAxis={(v) => `₵${v / 100}`} yWidth={52} />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Insurance claims" icon="ShieldCheck" contentClassName="pt-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Open (submitted)</span><span className="font-semibold">{report.claims.open}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Submitted value</span><span className="font-semibold">{formatMoney(report.claims.submittedCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span className="font-semibold text-emerald-700">{formatMoney(report.claims.approvedCents)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Outstanding on open</span><span className="font-semibold text-rose-700">{formatMoney(report.claims.outstandingCents)}</span></div>
          </div>
        </SectionCard>

        <SectionCard title="Package utilisation" icon="Package" contentClassName="pt-3">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-2xl font-bold text-navy-800">{report.packageUtilisation.percent}%</p>
              <p className="text-xs text-muted-foreground">{report.packageUtilisation.usedSessions} / {report.packageUtilisation.totalSessions} sessions used</p>
            </div>
            <Progress value={report.packageUtilisation.percent} className="h-2.5" />
            <p className="text-xs text-muted-foreground">Across active + exhausted patient packages</p>
          </div>
        </SectionCard>

        <SectionCard title="Revenue split" icon="PieChart" contentClassName="pt-3">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Pay-as-you-go</span><span className="font-semibold">{formatMoney(arr.paygCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Packages</span><span className="font-semibold">{formatMoney(arr.packageCents)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Insurance</span><span className="font-semibold">{formatMoney(arr.insuranceCents)}</span></div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Outstanding invoices (top 10)" icon="Receipt" noPadding>
        <DataTable
          bare
          maxHeight="max-h-none"
          rows={report.outstandingList}
          rowKey={(i) => i.id}
          empty={<EmptyStateCompact message="No outstanding invoices — all settled" />}
          columns={[
            { id: "invoice", header: "Invoice", cell: (i) => <span className="font-mono text-xs">{i.invoiceNumber}</span> },
            { id: "patient", header: "Patient", cell: (i) => <span className="text-sm">{i.patientName}</span> },
            { id: "total", header: "Total", align: "right", cell: (i) => <span className="text-sm">{formatMoney(i.totalCents)}</span> },
            { id: "paid", header: "Paid", align: "right", cell: (i) => <span className="text-sm">{formatMoney(i.paidCents)}</span> },
            { id: "outstanding", header: "Outstanding", align: "right", cell: (i) => <span className="text-sm font-semibold text-rose-700">{formatMoney(i.outstandingCents)}</span> },
            { id: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
            { id: "arrangement", header: "Arrangement", hideBelow: "md", cell: (i) => <span className="text-sm text-muted-foreground">{labelize(i.arrangement)}</span> },
          ]}
        />
      </SectionCard>
    </div>
  );
}
