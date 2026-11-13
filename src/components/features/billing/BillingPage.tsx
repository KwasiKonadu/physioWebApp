"use client";
// ============ Billing & Payments: overview + invoices + packages + insurance + services ============
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, relativeTime } from "@/lib/format";
import { useUIStore } from "@/stores/app-store";
import { labelize } from "@/lib/constants";
import {
  MiniBar,
  type ListResponse, type InvoiceListItem, type PatientPackageItem, type ClaimItem,
} from "./billing-shared";
import InvoicesTab from "./InvoicesTab";
import PackagesTab from "./PackagesTab";
import InsuranceTab from "./InsuranceTab";
import ServicesTab from "./ServicesTab";

type BillingTab = "overview" | "invoices" | "packages" | "insurance" | "services";

interface InvoiceStats {
  outstandingCount: number;
  outstandingCents: number;
  paidThisMonthCents: number;
  byArrangement: Record<string, number>;
  recentPayments: { id: string; invoiceNumber: string; patient: string; patientCode: string; amountCents: number; method: string; paidAt: string }[];
  recentRefunds: { id: string; invoiceNumber: string; patient: string; patientCode: string; amountCents: number; reason: string; refundedAt: string }[];
}

const methodBadge: Record<string, string> = {
  CASH: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MOBILE_MONEY: "bg-sky-50 text-sky-700 border-sky-200",
  CARD: "bg-violet-50 text-violet-700 border-violet-200",
  BANK_TRANSFER: "bg-amber-50 text-amber-700 border-amber-200",
  INSURANCE: "bg-teal-50 text-teal-700 border-teal-200",
};

function Overview({ onOpenInvoices }: { onOpenInvoices: () => void }) {
  const invoicesQ = useQuery({
    queryKey: ["billing", "overview", "invoices"],
    queryFn: () => apiFetch<ListResponse<InvoiceListItem> & { stats: InvoiceStats }>("/api/invoices?pageSize=1"),
  });
  const packagesQ = useQuery({
    queryKey: ["billing", "overview", "packages"],
    queryFn: () => apiFetch<ListResponse<PatientPackageItem> & { stats: { active: number; exhausted: number; expiringSoon: number } }>("/api/patient-packages?pageSize=1"),
  });
  const claimsQ = useQuery({
    queryKey: ["billing", "overview", "claims"],
    queryFn: () => apiFetch<ListResponse<ClaimItem> & { stats: { open: number; submitted: number; approvedCents: number } }>("/api/insurance/claims?pageSize=1"),
  });

  const stats = invoicesQ.data?.stats;
  const pkgStats = packagesQ.data?.stats;
  const claimStats = claimsQ.data?.stats;
  const byArrangement = stats?.byArrangement || { PAYG: 0, PACKAGE: 0, INSURANCE: 0 };
  const maxRevenue = Math.max(byArrangement.PAYG || 0, byArrangement.PACKAGE || 0, byArrangement.INSURANCE || 0);

  if (invoicesQ.isError || packagesQ.isError || claimsQ.isError) {
    return (
      <EmptyState icon="AlertCircle" title="Could not load billing overview" description="Please refresh or try again shortly." />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Outstanding balance"
          value={stats ? formatMoney(stats.outstandingCents) : "—"}
          hint={stats ? `${stats.outstandingCount} open invoice${stats.outstandingCount === 1 ? "" : "s"}` : undefined}
          icon="AlertCircle"
          tone="rose"
          loading={invoicesQ.isLoading}
          onClick={onOpenInvoices}
        />
        <StatCard
          label="Collected this month"
          value={stats ? formatMoney(stats.paidThisMonthCents) : "—"}
          hint="All payment channels"
          icon="Wallet"
          tone="emerald"
          loading={invoicesQ.isLoading}
        />
        <StatCard
          label="Active packages"
          value={pkgStats ? pkgStats.active : "—"}
          hint={pkgStats && pkgStats.expiringSoon > 0 ? `${pkgStats.expiringSoon} expiring within 14 days` : "No packages expiring soon"}
          icon="Layers"
          tone="teal"
          loading={packagesQ.isLoading}
        />
        <StatCard
          label="Open claims"
          value={claimStats ? claimStats.open : "—"}
          hint={claimStats ? `${claimStats.submitted} awaiting decision` : undefined}
          icon="ShieldCheck"
          tone="sky"
          loading={claimsQ.isLoading}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Revenue by arrangement" icon="BarChart3" description="Payments received this month" loading={invoicesQ.isLoading}>
          <div className="space-y-4 pt-1">
            <MiniBar label="Pay as you go" cents={byArrangement.PAYG || 0} max={maxRevenue} tone="bg-slate-500" />
            <MiniBar label="Packages" cents={byArrangement.PACKAGE || 0} max={maxRevenue} tone="bg-teal-500" />
            <MiniBar label="Insurance" cents={byArrangement.INSURANCE || 0} max={maxRevenue} tone="bg-sky-500" />
          </div>
        </SectionCard>

        <SectionCard title="Recent payments" icon="Receipt" loading={invoicesQ.isLoading} className="lg:col-span-1">
          {stats && stats.recentPayments.length > 0 ? (
            <ul className="space-y-3 pt-1">
              {stats.recentPayments.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.patient}</p>
                    <p className="text-xs text-muted-foreground">{p.invoiceNumber} · {relativeTime(p.paidAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-emerald-700">+{formatMoney(p.amountCents)}</span>
                    <Badge variant="outline" className={`text-[10px] ${methodBadge[p.method] || ""}`}>{labelize(p.method)}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            !invoicesQ.isLoading ? <EmptyState icon="Receipt" title="No payments yet" description="Payments recorded on invoices will appear here." /> : null
          )}
        </SectionCard>

        <SectionCard title="Recent refunds" icon="Undo2" loading={invoicesQ.isLoading}>
          {stats && stats.recentRefunds.length > 0 ? (
            <ul className="space-y-3 pt-1">
              {stats.recentRefunds.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-b pb-2.5 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.patient}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums text-rose-600">-{formatMoney(r.amountCents)}</span>
                    <span className="text-[11px] text-muted-foreground">{relativeTime(r.refundedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            !invoicesQ.isLoading ? <EmptyState icon="Undo2" title="No refunds" description="Approved refunds will appear here." /> : null
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);
  const [tab, setTab] = useState<BillingTab>("overview");
  const [prefillPatientId, setPrefillPatientId] = useState<string | null>(null);

  // Consume navigation options (focusTab / patientId) — via a task so we never set state synchronously in the effect
  useEffect(() => {
    if (!navOpts) return;
    const opts = navOpts;
    const t = setTimeout(() => {
      if (opts.focusTab && ["invoices", "packages", "insurance", "services"].includes(opts.focusTab)) {
        setTab(opts.focusTab as BillingTab);
      }
      if (opts.patientId) setPrefillPatientId(opts.patientId);
      clearOpts();
    }, 0);
    return () => clearTimeout(t);
  }, [navOpts, clearOpts]);

  return (
    <div className="space-y-1">
      <PageHeader
        title="Billing & Payments"
        description="Invoices, packages, private insurance and the services catalogue"
        icon="Receipt"
        filters={
          <Tabs value={tab} onValueChange={(v) => setTab(v as BillingTab)}>
            <TabsList className="h-9">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="invoices" className="text-xs">Invoices</TabsTrigger>
              <TabsTrigger value="packages" className="text-xs">Packages</TabsTrigger>
              <TabsTrigger value="insurance" className="text-xs">Insurance</TabsTrigger>
              <TabsTrigger value="services" className="text-xs">Services</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as BillingTab)}>
        <TabsContent value="overview" className="mt-2">
          <Overview onOpenInvoices={() => setTab("invoices")} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-2">
          <InvoicesTab prefillPatientId={prefillPatientId} />
        </TabsContent>
        <TabsContent value="packages" className="mt-2">
          <PackagesTab prefillPatientId={prefillPatientId} />
        </TabsContent>
        <TabsContent value="insurance" className="mt-2">
          <InsuranceTab />
        </TabsContent>
        <TabsContent value="services" className="mt-2">
          <ServicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
