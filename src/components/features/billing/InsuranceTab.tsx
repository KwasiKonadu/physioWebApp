"use client";
// ============ Insurance tab: providers + negotiated rates + claims workflow ============
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { StatCard } from "@/components/molecules/stat-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, CLAIM_STATUSES, labelize } from "@/lib/constants";
import { patientName, type ListResponse, type ProviderLite, type ClaimItem } from "./billing-shared";
import { ARRANGEMENT_TONE } from "./insurance-shared";
import { ProviderDialog } from "./ProviderDialog";
import { ProviderDetailDialog } from "./ProviderDetailDialog";
import { ClaimActionDialog, RejectClaimDialog } from "./ClaimDialogs";

export default function InsuranceTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.insuranceManage);
  const canBill = hasPermission(user, PERMS.billingManage);

  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderLite | null>(null);
  const [detailProviderId, setDetailProviderId] = useState<string | null>(null);

  // the page is a list of insurers; selecting one shows that insurer's claims
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [claimStatus, setClaimStatus] = useState("all");
  const [claimPage, setClaimPage] = useState(1);
  const [claimPageSize, setClaimPageSize] = useState(10);
  const [actionClaim, setActionClaim] = useState<{ claim: ClaimItem; action: "approve" | "partial" | "record_payment" | "reject" } | null>(null);

  const providersQ = useQuery({
    queryKey: ["billing", "providers", "all"],
    queryFn: () => apiFetch<ListResponse<ProviderLite>>("/api/insurance/providers?pageSize=100"),
  });

  const claimsParams = new URLSearchParams({ page: String(claimPage), pageSize: String(claimPageSize) });
  if (selectedProviderId) claimsParams.set("providerId", selectedProviderId);
  if (claimStatus !== "all") claimsParams.set("status", claimStatus);
  const claimsQ = useQuery({
    queryKey: ["billing", "claims", claimsParams.toString()],
    queryFn: () => apiFetch<ListResponse<ClaimItem> & { stats: { open: number; submitted: number; claimedCents: number; approvedCents: number } }>(`/api/insurance/claims?${claimsParams.toString()}`),
    enabled: !!selectedProviderId,
  });

  // clinic-wide totals for the provider list (the provider view shows that provider's own totals)
  const overallQ = useQuery({
    queryKey: ["billing", "claims", "overall-stats"],
    queryFn: () => apiFetch<ListResponse<ClaimItem> & { stats: { open: number; submitted: number; claimedCents: number; approvedCents: number } }>("/api/insurance/claims?page=1&pageSize=1"),
    enabled: !selectedProviderId,
  });

  const toggleProviderM = useMutation({
    mutationFn: (p: ProviderLite) => apiFetch(`/api/insurance/providers/${p.id}`, { method: "PATCH", json: { active: !p.active } }),
    onSuccess: () => {
      toast.success("Provider updated");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitClaimM = useMutation({
    mutationFn: (claimId: string) => apiFetch(`/api/insurance/claims/${claimId}`, { method: "PATCH", json: { action: "submit" } }),
    onSuccess: () => {
      toast.success("Claim submitted to provider");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const providers = providersQ.data?.items || [];
  const claims = claimsQ.data?.items || [];
  const claimStats = claimsQ.data?.stats;
  const selected = providers.find((p) => p.id === selectedProviderId) || null;

  const selectProvider = (id: string | null) => {
    setSelectedProviderId(id);
    setClaimStatus("all");
    setClaimPage(1);
  };

  return (
    <div className="space-y-5">
      {!selectedProviderId || !selected ? (
        /* ================= provider list ================= */
        <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Open claims" value={overallQ.data ? overallQ.data.stats.open : "—"} icon="ShieldCheck" tone="sky" loading={overallQ.isLoading} />
          <StatCard label="Awaiting decision" value={overallQ.data ? overallQ.data.stats.submitted : "—"} icon="Send" tone="amber" loading={overallQ.isLoading} />
          <StatCard label="Total claimed" value={overallQ.data ? formatMoney(overallQ.data.stats.claimedCents) : "—"} icon="Receipt" tone="navy" loading={overallQ.isLoading} />
          <StatCard label="Total approved" value={overallQ.data ? formatMoney(overallQ.data.stats.approvedCents) : "—"} icon="BadgeCheck" tone="emerald" loading={overallQ.isLoading} />
        </div>
        <SectionCard
          title="Insurance providers"
          icon="Shield"
          description="Select a provider to see its claims and record payments"
          loading={providersQ.isLoading}
          actions={canManage ? <Button size="sm" onClick={() => { setEditingProvider(null); setProviderDialogOpen(true); }}>New provider</Button> : null}
        >
          {providers.length === 0 ? (
            <EmptyState icon="Shield" title="No insurance providers" description="Add a provider to start billing insured patients." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {providers.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectProvider(p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectProvider(p.id); } }}
                  className="cursor-pointer rounded-lg border p-3.5 transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.code} · {p.contactName || "No contact"}</p>
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${ARRANGEMENT_TONE[p.billingArrangement] || ""}`}>{labelize(p.billingArrangement)}</Badge>
                  </div>
                  <div className="mt-2.5 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Coverage <span className="font-semibold text-foreground">{p.coveragePercent}%</span></span>
                    <span>Rates <span className="font-semibold text-foreground">{p._count?.rates ?? 0}</span></span>
                    <span>Claims <span className="font-semibold text-foreground">{p._count?.claims ?? 0}</span></span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t pt-2.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    {canManage ? (
                      <Switch checked={p.active} onCheckedChange={() => toggleProviderM.mutate(p)} aria-label={`Toggle ${p.name}`} />
                    ) : (
                      <span className={`text-xs font-medium ${p.active ? "text-emerald-700" : "text-muted-foreground"}`}>{p.active ? "Active" : "Inactive"}</span>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setDetailProviderId(p.id)}>Rates</Button>
                      {canManage ? (
                        <Button size="sm" variant="outline" onClick={() => { setEditingProvider(p); setProviderDialogOpen(true); }}>Edit</Button>
                      ) : null}
                      <Button size="sm" onClick={() => selectProvider(p.id)}>Claims</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        </>
      ) : (
        /* ================= one provider: its claims ================= */
        <>
          <PageBreadcrumb items={[{ label: "Insurance providers", onClick: () => selectProvider(null) }, { label: selected.name }]} />

          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold tracking-tight">{selected.name}</h2>
                  <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy-800">{selected.code}</span>
                  <Badge variant="outline" className={ARRANGEMENT_TONE[selected.billingArrangement] || ""}>{labelize(selected.billingArrangement)}</Badge>
                  <span className={`text-xs font-medium ${selected.active ? "text-emerald-700" : "text-muted-foreground"}`}>{selected.active ? "Active" : "Inactive"}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Default coverage {selected.coveragePercent}% · {selected._count?.rates ?? 0} negotiated rates{selected.contactName ? ` · Contact: ${selected.contactName}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDetailProviderId(selected.id)}>Rates</Button>
                {canManage ? (
                  <Button size="sm" variant="outline" onClick={() => { setEditingProvider(selected); setProviderDialogOpen(true); }}>Edit</Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Open claims" value={claimStats ? claimStats.open : "—"} icon="ShieldCheck" tone="sky" loading={claimsQ.isLoading} />
            <StatCard label="Awaiting decision" value={claimStats ? claimStats.submitted : "—"} icon="Send" tone="amber" loading={claimsQ.isLoading} />
            <StatCard label="Total claimed" value={claimStats ? formatMoney(claimStats.claimedCents) : "—"} icon="Receipt" tone="navy" loading={claimsQ.isLoading} />
            <StatCard label="Total approved" value={claimStats ? formatMoney(claimStats.approvedCents) : "—"} icon="BadgeCheck" tone="emerald" loading={claimsQ.isLoading} />
          </div>

          <div>
            <div className="mb-3">
              <DataToolbar
                onRefresh={() => qc.invalidateQueries({ queryKey: ["billing", "claims"] })}
                refreshing={claimsQ.isFetching}
                filters={
                  <Select value={claimStatus} onValueChange={(v) => { setClaimStatus(v); setClaimPage(1); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                }
              />
            </div>
            <DataTable
              rows={claims}
              rowKey={(c: ClaimItem) => c.id}
              loading={claimsQ.isLoading}
              loadingRows={5}
              minWidth="min-w-200"
              empty={
                <EmptyState
                  icon="ShieldCheck"
                  title={`No claims for ${selected.name}`}
                  description={claimStatus !== "all" ? "No claims match this status." : "Create claims from this provider's insurance invoices — see the Invoices tab."}
                />
              }
              pagination={{ page: claimPage, pageSize: claimPageSize, total: claimsQ.data?.total || 0, onPageChange: setClaimPage, onPageSizeChange: (n) => { setClaimPageSize(n); setClaimPage(1); } }}
              columns={[
                { id: "claim", header: "Claim", cell: (c) => <span className="font-medium">{c.claimNumber}</span> },
                {
                  id: "invoice", header: "Invoice / Patient",
                  cell: (c) => (
                    <>
                      <p className="text-sm font-medium">{c.invoice.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{patientName(c.invoice.patient)}</p>
                    </>
                  ),
                },
                { id: "claimed", header: "Claimed", align: "right", cell: (c) => <span className="tabular-nums">{formatMoney(c.claimedCents)}</span> },
                { id: "approved", header: "Approved", align: "right", cell: (c) => <span className="tabular-nums">{c.approvedCents > 0 ? formatMoney(c.approvedCents) : "—"}</span> },
                { id: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
                {
                  id: "dates", header: "Dates", hideBelow: "lg",
                  cell: (c) => (
                    <div className="text-xs text-muted-foreground">
                      <p>Sub {c.submittedDate ? formatDate(c.submittedDate) : "—"}</p>
                      <p>Dec {c.decisionDate ? formatDate(c.decisionDate) : "—"}</p>
                    </div>
                  ),
                },
                {
                  id: "actions", header: "Actions", align: "right",
                  cell: (c) => (
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {c.status === "DRAFT" && canBill && (
                        <Button size="sm" variant="outline" disabled={submitClaimM.isPending} onClick={() => submitClaimM.mutate(c.id)}>Submit</Button>
                      )}
                      {c.status === "SUBMITTED" && canBill && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setActionClaim({ claim: c, action: "approve" })}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => setActionClaim({ claim: c, action: "partial" })}>Partial</Button>
                          <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setActionClaim({ claim: c, action: "reject" })}>Reject</Button>
                        </>
                      )}
                      {["APPROVED", "PARTIALLY_APPROVED", "SUBMITTED"].includes(c.status) && c.invoice.totalCents - c.invoice.paidCents > 0 && canBill && (
                        <Button size="sm" onClick={() => setActionClaim({ claim: c, action: "record_payment" })}>Record payment</Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}

      {providerDialogOpen && <ProviderDialog open initial={editingProvider} onClose={() => setProviderDialogOpen(false)} />}
      <ProviderDetailDialog providerId={detailProviderId} open={!!detailProviderId} onClose={() => { setDetailProviderId(null); qc.invalidateQueries({ queryKey: ["billing"] }); }} />
      {actionClaim ? (
        actionClaim.action === "reject" ? (
          <RejectClaimDialog claim={actionClaim.claim} open onClose={() => setActionClaim(null)} />
        ) : (
          <ClaimActionDialog claim={actionClaim.claim} action={actionClaim.action} open onClose={() => setActionClaim(null)} />
        )
      ) : null}
    </div>
  );
}
