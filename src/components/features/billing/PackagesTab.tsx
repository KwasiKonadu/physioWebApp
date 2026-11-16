"use client";
// ============ Packages tab: definitions catalogue + patient package sales & ledgers ============
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";



import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Switch } from "@/components/ui/switch";

import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, labelize } from "@/lib/constants";
import { patientName, type ListResponse, type PackageDef, type PatientPackageItem } from "./billing-shared";

import { PackageDefDialog } from "./PackageDefDialog";
import { AssignPackageDialog } from "./AssignPackageDialog";
import { LedgerDialog } from "./LedgerDialog";

export default function PackagesTab({ prefillPatientId }: { prefillPatientId?: string | null }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.packagesManage);

  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<PackageDef | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const defsQ = useQuery({
    queryKey: ["billing", "package-defs", "all"],
    queryFn: () => apiFetch<ListResponse<PackageDef>>("/api/packages?pageSize=100"),
  });

  const ppParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status !== "all") ppParams.set("status", status);
  const ppQ = useQuery({
    queryKey: ["billing", "patient-packages", ppParams.toString()],
    queryFn: () => apiFetch<ListResponse<PatientPackageItem> & { stats: { active: number; exhausted: number; expiringSoon: number } }>(`/api/patient-packages?${ppParams.toString()}`),
  });

  const toggleActiveM = useMutation({
    mutationFn: (p: PackageDef) => apiFetch(`/api/packages/${p.id}`, { method: "PATCH", json: { active: !p.active } }),
    onSuccess: () => {
      toast.success("Package updated");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defs = defsQ.data?.items || [];
  const rows = ppQ.data?.items || [];
  const stats = ppQ.data?.stats;

  return (
    <div className="space-y-5">
      {stats ? (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active packages" value={stats.active} icon="Layers" tone="teal" loading={ppQ.isLoading} />
          <StatCard label="Exhausted" value={stats.exhausted} icon="CheckCircle2" tone="amber" loading={ppQ.isLoading} />
          <StatCard label="Expiring ≤ 14 days" value={stats.expiringSoon} icon="CalendarClock" tone="rose" loading={ppQ.isLoading} />
        </div>
      ) : null}

      <SectionCard
        title="Package definitions"
        icon="Package"
        description="Session bundles offered for sale"
        loading={defsQ.isLoading}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => { setEditingDef(null); setDefDialogOpen(true); }}>
              New package
            </Button>
          ) : null
        }
      >
        {defs.length === 0 ? (
          <EmptyState icon="Package" title="No package definitions" description="Create a package to start selling session bundles." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {defs.map((d) => (
              <div key={d.id} className="rounded-lg border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{d.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.description || "—"}</p>
                  </div>
                  <Badge variant="outline" className={d.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{d.active ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-sm font-semibold">{d.sessions}</p><p className="text-[11px] text-muted-foreground">sessions</p></div>
                  <div><p className="text-sm font-semibold">{formatMoney(d.priceCents)}</p><p className="text-[11px] text-muted-foreground">price</p></div>
                  <div><p className="text-sm font-semibold">{d.validityDays}d</p><p className="text-[11px] text-muted-foreground">validity</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                  <span className="text-xs text-muted-foreground">Sold {d._count?.patientPackages ?? 0}×</span>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={d.active}
                        onCheckedChange={() => toggleActiveM.mutate(d)}
                        aria-label={`Toggle ${d.name}`}
                      />
                      <Button size="sm" variant="outline" onClick={() => { setEditingDef(d); setDefDialogOpen(true); }}>Edit</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="mb-3">
        <DataToolbar
          onRefresh={() => qc.invalidateQueries({ queryKey: ["billing", "patient-packages"] })}
          refreshing={ppQ.isFetching}
          filters={
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-37.5"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        >
          {canManage ? <Button size="sm" onClick={() => setAssignOpen(true)}>Assign package</Button> : null}
        </DataToolbar>
      </div>
      <DataTable
        rows={rows}
        rowKey={(pp) => pp.id}
        loading={ppQ.isLoading}
        loadingRows={5}
        minWidth="min-w-200"
        empty={<EmptyState icon="Layers" title="No patient packages" description="Assign a package to a patient to see it here." />}
        pagination={{ page, pageSize, total: ppQ.data?.total || 0, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
        columns={[
          {
            id: "patient", header: "Patient",
            cell: (pp) => (
              <>
                <p className="text-sm font-medium">{patientName(pp.patient)}</p>
                <p className="text-xs text-muted-foreground">{pp.patient.patientCode}</p>
              </>
            ),
          },
          { id: "package", header: "Package", cell: (pp) => <span className="text-sm">{pp.package.name}</span> },
          { id: "purchased", header: "Purchased", hideBelow: "md", cell: (pp) => <span className="text-sm text-muted-foreground">{formatDate(pp.purchaseDate)}</span> },
          { id: "expiry", header: "Expiry", hideBelow: "md", cell: (pp) => <span className="text-sm text-muted-foreground">{formatDate(pp.expiryDate)}</span> },
          {
            id: "usage", header: "Usage", className: "min-w-35",
            cell: (pp) => (
              <>
                <div className="flex items-center gap-2">
                  <Progress value={pp.totalSessions ? (pp.usedSessions / pp.totalSessions) * 100 : 0} className="h-2 w-16" />
                  <span className="text-xs tabular-nums text-muted-foreground">{pp.usedSessions}/{pp.totalSessions}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-teal-700">{pp.remaining} remaining</p>
              </>
            ),
          },
          { id: "paid", header: "Paid", align: "right", cell: (pp) => <span className="tabular-nums">{formatMoney(pp.amountPaidCents)}</span> },
          { id: "status", header: "Status", cell: (pp) => <StatusBadge status={pp.status} /> },
          { id: "actions", header: "Actions", align: "right", cell: (pp) => <Button size="sm" variant="outline" onClick={() => setLedgerId(pp.id)}>Ledger</Button> },
        ]}
      />

      {defDialogOpen && <PackageDefDialog open initial={editingDef} onClose={() => setDefDialogOpen(false)} />}
      {assignOpen && <AssignPackageDialog open onClose={() => setAssignOpen(false)} prefillPatientId={prefillPatientId} />}
      <LedgerDialog patientPackageId={ledgerId} open={!!ledgerId} onClose={() => { setLedgerId(null); qc.invalidateQueries({ queryKey: ["billing", "patient-packages"] }); }} />
    </div>
  );
}
