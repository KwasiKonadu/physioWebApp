"use client";
// Staff page: salaries tab — pay method and rate for every staff member, with the fixed monthly payroll total.
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { labelize } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { EmptyState } from "@/components/molecules/empty-state";
import { Button } from "@/components/ui/button";
import type { StaffListItem, StaffListResponse } from "./StaffPage";

const METHOD_LABEL: Record<string, string> = {
  FIXED: "Fixed monthly salary",
  PER_PATIENT: "Per unique patient",
  PER_SESSION: "Per completed session",
};

export function StaffSalariesTab() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["staff", "salaries"],
    queryFn: () => apiFetch<StaffListResponse>("/api/staff?pageSize=200"),
  });
  const items = (data?.items ?? []).filter((s) => s.employmentStatus !== "TERMINATED");

  const fixed = items.filter((s) => s.remunerationMethod === "FIXED");
  const fixedTotal = fixed.reduce((sum, s) => sum + (s.remunerationRateCents ?? 0), 0);
  const variable = items.filter((s) => s.remunerationMethod !== "FIXED").length;
  const unset = items.filter((s) => !s.remunerationRateCents).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Monthly fixed payroll" value={formatMoney(fixedTotal)} icon="Wallet" tone="navy" loading={!data} />
        <StatCard label="Salaried staff" value={fixed.length} icon="Banknote" tone="teal" loading={!data} />
        <StatCard label="Performance-paid" value={variable} icon="Activity" tone="emerald" loading={!data} />
        <StatCard label="No rate set" value={unset} icon="CircleAlert" tone="amber" loading={!data} />
      </div>

      <DataTable
        rows={items}
        rowKey={(r: StaffListItem) => r.id}
        loading={isLoading}
        minWidth="min-w-220"
        onRowClick={(r) => router.push(`/staff/${r.id}`)}
        empty={<div className="p-4"><EmptyState icon="Wallet" title="No staff" description="Add staff members to manage their pay." /></div>}
        columns={[
          { id: "code", header: "Staff ID", cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.staffCode}</span> },
          { id: "name", header: "Name", cell: (r) => (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">{r.jobTitle}</p>
            </div>
          ) },
          { id: "role", header: "Role", hideBelow: "md", cell: (r) => <span className="text-sm text-muted-foreground">{labelize(r.staffRole)}</span> },
          { id: "method", header: "Pay method", cell: (r) => <span className="text-sm">{METHOD_LABEL[r.remunerationMethod] ?? labelize(r.remunerationMethod)}</span> },
          { id: "rate", header: "Rate", align: "right", cell: (r) => r.remunerationRateCents ? (
            <span className="text-sm font-medium">
              {formatMoney(r.remunerationRateCents)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {r.remunerationMethod === "FIXED" ? "/ month" : r.remunerationMethod === "PER_SESSION" ? "/ session" : "/ patient"}
              </span>
            </span>
          ) : <span className="text-sm text-muted-foreground">Not set</span> },
          { id: "actions", header: "Actions", align: "right", cell: (r) => (
            <div onClick={(e) => e.stopPropagation()}>
              <Button variant="outline" size="sm" onClick={() => router.push(`/staff/${r.id}`)}>Manage</Button>
            </div>
          ) },
        ]}
      />
    </div>
  );
}
