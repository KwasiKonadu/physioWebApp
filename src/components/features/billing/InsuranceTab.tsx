"use client";
// ============ Insurance tab: providers + negotiated rates + claims workflow ============
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { TablePagination } from "@/components/molecules/table-pagination";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, CLAIM_STATUSES, labelize } from "@/lib/constants";
import {
  patientName, inputToCents, centsToInput,
  type ListResponse, type ProviderLite, type RateItem, type ClaimItem, type ServiceLite,
} from "./billing-shared";

const ARRANGEMENT_TONE: Record<string, string> = {
  DIRECT_BILLING: "bg-teal-50 text-teal-700 border-teal-200",
  REIMBURSEMENT: "bg-sky-50 text-sky-700 border-sky-200",
  CAPITATION: "bg-violet-50 text-violet-700 border-violet-200",
};

// ---- Provider add/edit ----
function ProviderDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial: ProviderLite | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => initial?.name || "");
  const [code, setCode] = useState(() => initial?.code || "");
  const [contactName, setContactName] = useState(() => initial?.contactName || "");
  const [contactPhone, setContactPhone] = useState(() => initial?.contactPhone || "");
  const [email, setEmail] = useState(() => initial?.email || "");
  const [billingArrangement, setBillingArrangement] = useState(() => initial?.billingArrangement || "DIRECT_BILLING");
  const [coverage, setCoverage] = useState(() => (initial ? String(initial.coveragePercent) : "80"));
  const [active, setActive] = useState(() => (initial ? initial.active : true));
  const [error, setError] = useState<string | null>(null);

  const saveM = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        email: email.trim() || undefined,
        billingArrangement,
        coveragePercent: parseInt(coverage, 10) || 0,
        active,
      };
      if (initial) return apiFetch(`/api/insurance/providers/${initial.id}`, { method: "PATCH", json: payload });
      return apiFetch("/api/insurance/providers", { method: "POST", json: payload });
    },
    onSuccess: () => {
      toast.success(initial ? "Provider updated" : "Provider created");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit insurance provider" : "New insurance provider"}</DialogTitle>
          <DialogDescription>Negotiated service rates override the provider default coverage.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glory Health Insurance" />
          </div>
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="GHI" disabled={!!initial} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact person</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact phone</Label>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="claims@provider.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Billing arrangement</Label>
            <Select value={billingArrangement} onValueChange={setBillingArrangement}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["DIRECT_BILLING", "REIMBURSEMENT", "CAPITATION"].map((x) => <SelectItem key={x} value={x}>{labelize(x)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Default coverage (%)</Label>
            <Input type="number" min={0} max={100} value={coverage} onChange={(e) => setCoverage(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Active</Label>
            <div className="flex h-10 items-center"><Switch checked={active} onCheckedChange={setActive} /></div>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(null); saveM.mutate(); }} disabled={saveM.isPending || !name.trim() || !code.trim()}>
            {saveM.isPending ? "Saving…" : initial ? "Save changes" : "Create provider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Provider detail: negotiated rates ----
function ProviderDetailDialog({
  providerId,
  open,
  onClose,
}: {
  providerId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rateOpen, setRateOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateItem | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [rateText, setRateText] = useState("");
  const [coverage, setCoverage] = useState("80");
  const [error, setError] = useState<string | null>(null);

  const providerQ = useQuery({
    queryKey: ["billing", "provider", providerId, "detail"],
    queryFn: () => apiFetch<{ provider: ProviderLite & { rates?: RateItem[] } }>(`/api/insurance/providers/${providerId}?rates=true`),
    enabled: open && !!providerId,
  });
  const servicesQ = useQuery({
    queryKey: ["billing", "services-active"],
    queryFn: () => apiFetch<ListResponse<ServiceLite>>("/api/services?active=true&pageSize=200"),
    enabled: open,
  });
  const provider = providerQ.data?.provider;
  const rates = provider?.rates || [];
  const services = servicesQ.data?.items || [];

  const openRateForm = (rate: RateItem | null) => {
    setEditingRate(rate);
    setServiceId(rate?.serviceId || "");
    setRateText(rate ? centsToInput(rate.rateCents) : "");
    setCoverage(rate ? String(rate.coveragePercent) : String(provider?.coveragePercent ?? 80));
    setError(null);
    setRateOpen(true);
  };

  const saveRateM = useMutation({
    mutationFn: () => {
      const selected = services.find((s) => s.id === serviceId);
      if (!selected) throw new Error("Select a service");
      return apiFetch(`/api/insurance/providers/${providerId}/rates`, {
        method: "POST",
        json: { serviceId, rateCents: inputToCents(rateText), coveragePercent: parseInt(coverage, 10) || 0 },
      });
    },
    onSuccess: () => {
      toast.success("Rate saved");
      qc.invalidateQueries({ queryKey: ["billing"] });
      setRateOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{provider ? `${provider.name} (${provider.code})` : "Provider"}</DialogTitle>
            <DialogDescription>
              {provider ? `${labelize(provider.billingArrangement)} · default coverage ${provider.coveragePercent}%` : ""}
            </DialogDescription>
          </DialogHeader>
          {provider ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Contact</p><p className="font-medium">{provider.contactName || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{provider.contactPhone || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{provider.email || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Claims</p><p className="font-medium">{provider._count?.claims ?? 0}</p></div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Negotiated rates ({rates.length})</p>
                <Button size="sm" onClick={() => openRateForm(null)}>Add / update rate</Button>
              </div>
              {rates.length === 0 ? (
                <EmptyState icon="Percent" title="No rates configured" description="Add negotiated rates per service — invoices will fall back to standard prices otherwise." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Standard</TableHead>
                      <TableHead className="text-right">Negotiated</TableHead>
                      <TableHead className="text-right">Coverage</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rates.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm">{r.service?.name || r.serviceId}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatMoney(r.service?.standardPriceCents)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatMoney(r.rateCents)}</TableCell>
                        <TableCell className="text-right">{r.coveragePercent}%</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openRateForm(r)}>Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={(o) => { if (!o) setRateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRate ? "Update rate" : "Add negotiated rate"}</DialogTitle>
            <DialogDescription>Stored per provider + service. Invoicing snapshots the applied rate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Service *</Label>
              <Select value={serviceId} onValueChange={(v) => {
                setServiceId(v);
                const svc = services.find((s) => s.id === v);
                if (svc && !editingRate) setRateText(String(svc.standardPriceCents / 100));
              }} disabled={!!editingRate}>
                <SelectTrigger><SelectValue placeholder="Select service…" /></SelectTrigger>
                <SelectContent className="custom-scrollbar max-h-64">
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · std {formatMoney(s.standardPriceCents)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rate (₵) *</Label>
                <Input type="number" min={0} step="0.01" value={rateText} onChange={(e) => setRateText(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Coverage (%) *</Label>
                <Input type="number" min={0} max={100} value={coverage} onChange={(e) => setCoverage(e.target.value)} />
              </div>
            </div>
          </div>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateOpen(false)}>Cancel</Button>
            <Button onClick={() => { setError(null); saveRateM.mutate(); }} disabled={saveRateM.isPending || !serviceId || inputToCents(rateText) <= 0}>
              {saveRateM.isPending ? "Saving…" : "Save rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Claim decision / settlement dialog ----
function ClaimActionDialog({
  claim,
  action, // approve | partial | record_payment
  open,
  onClose,
}: {
  claim: ClaimItem;
  action: "approve" | "partial" | "record_payment";
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const remainingOnInvoice = claim.invoice.totalCents - claim.invoice.paidCents;
  const [amountText, setAmountText] = useState(() =>
    action === "record_payment"
      ? centsToInput(Math.min(remainingOnInvoice, claim.claimedCents - claim.approvedCents) || remainingOnInvoice)
      : centsToInput(claim.claimedCents)
  );
  const [reference, setReference] = useState(claim.claimNumber);
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: () => {
      const payload =
        action === "record_payment"
          ? { action: "record_payment", amountCents: inputToCents(amountText), reference: reference.trim() || undefined }
          : { action, approvedCents: inputToCents(amountText) };
      return apiFetch(`/api/insurance/claims/${claim.id}`, { method: "PATCH", json: payload });
    },
    onSuccess: () => {
      toast.success(action === "record_payment" ? "Insurance payment recorded" : "Claim decision saved");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const title = action === "approve" ? `Approve claim ${claim.claimNumber}` : action === "partial" ? `Partial approval — ${claim.claimNumber}` : `Record insurance payment — ${claim.claimNumber}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Claimed {formatMoney(claim.claimedCents)} · invoice {claim.invoice.invoiceNumber} (outstanding {formatMoney(remainingOnInvoice)})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{action === "record_payment" ? "Amount received (₵)" : "Approved amount (₵)"}</Label>
            <Input type="number" min={0} step="0.01" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {action === "record_payment"
                ? "Recorded as an INSURANCE payment on the invoice; the claim closes as PAID when the invoice is fully settled."
                : "Equal to the claimed amount marks the claim APPROVED; anything less records PARTIALLY_APPROVED."}
            </p>
          </div>
          {action === "record_payment" && (
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          )}
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(null); m.mutate(); }} disabled={m.isPending || inputToCents(amountText) <= 0}>
            {m.isPending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectClaimDialog({ claim, open, onClose }: { claim: ClaimItem; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: () => apiFetch(`/api/insurance/claims/${claim.id}`, { method: "PATCH", json: { action: "reject", notes: notes.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Claim rejected");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reject claim {claim.claimNumber}?</AlertDialogTitle>
          <AlertDialogDescription>The decision date is recorded and the patient remains responsible for the invoice balance.</AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Rejection reason (optional)" />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={m.isPending} onClick={(e) => { e.preventDefault(); m.mutate(); }}>
            Reject claim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function InsuranceTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.insuranceManage);
  const canBill = hasPermission(user, PERMS.billingManage);

  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderLite | null>(null);
  const [detailProviderId, setDetailProviderId] = useState<string | null>(null);

  const [claimProvider, setClaimProvider] = useState("all");
  const [claimStatus, setClaimStatus] = useState("all");
  const [claimPage, setClaimPage] = useState(1);
  const [claimPageSize, setClaimPageSize] = useState(10);
  const [actionClaim, setActionClaim] = useState<{ claim: ClaimItem; action: "approve" | "partial" | "record_payment" | "reject" } | null>(null);

  const providersQ = useQuery({
    queryKey: ["billing", "providers", "all"],
    queryFn: () => apiFetch<ListResponse<ProviderLite>>("/api/insurance/providers?pageSize=100"),
  });
  const claimsParams = new URLSearchParams({ page: String(claimPage), pageSize: String(claimPageSize) });
  if (claimProvider !== "all") claimsParams.set("providerId", claimProvider);
  if (claimStatus !== "all") claimsParams.set("status", claimStatus);
  const claimsQ = useQuery({
    queryKey: ["billing", "claims", claimsParams.toString()],
    queryFn: () => apiFetch<ListResponse<ClaimItem> & { stats: { open: number; submitted: number; claimedCents: number; approvedCents: number } }>(`/api/insurance/claims?${claimsParams.toString()}`),
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

  return (
    <div className="space-y-5">
      {claimStats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Open claims" value={claimStats.open} icon="ShieldCheck" tone="sky" loading={claimsQ.isLoading} />
          <StatCard label="Awaiting decision" value={claimStats.submitted} icon="Send" tone="amber" loading={claimsQ.isLoading} />
          <StatCard label="Total claimed" value={formatMoney(claimStats.claimedCents)} icon="Receipt" tone="navy" loading={claimsQ.isLoading} />
          <StatCard label="Total approved" value={formatMoney(claimStats.approvedCents)} icon="BadgeCheck" tone="emerald" loading={claimsQ.isLoading} />
        </div>
      ) : null}

      <SectionCard
        title="Insurance providers"
        icon="Shield"
        description="Private insurers and their negotiated service rates"
        loading={providersQ.isLoading}
        actions={canManage ? <Button size="sm" onClick={() => { setEditingProvider(null); setProviderDialogOpen(true); }}>New provider</Button> : null}
      >
        {providers.length === 0 ? (
          <EmptyState icon="Shield" title="No insurance providers" description="Add a provider to start billing insured patients." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((p) => (
              <div key={p.id} className="rounded-lg border p-3.5">
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
                <div className="mt-3 flex items-center justify-between border-t pt-2.5">
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
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b p-4">
          <DataToolbar
            onRefresh={() => qc.invalidateQueries({ queryKey: ["billing", "claims"] })}
            refreshing={claimsQ.isFetching}
            filters={
              <>
                <Select value={claimProvider} onValueChange={(v) => { setClaimProvider(v); setClaimPage(1); }}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Provider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={claimStatus} onValueChange={(v) => { setClaimStatus(v); setClaimPage(1); }}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {CLAIM_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            }
          />
        </div>

        {claimsQ.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : claims.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="ShieldCheck" title="No claims" description="Create claims from insurance invoices — see the Invoices tab." />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Invoice / Patient</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Claimed</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Dates</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.claimNumber}</TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{c.invoice.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{patientName(c.invoice.patient)}</p>
                    </TableCell>
                    <TableCell className="text-sm">{c.provider.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.claimedCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.approvedCents > 0 ? formatMoney(c.approvedCents) : "—"}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      <p>Sub {c.submittedDate ? formatDate(c.submittedDate) : "—"}</p>
                      <p>Dec {c.decisionDate ? formatDate(c.decisionDate) : "—"}</p>
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={claimPage}
              pageSize={claimPageSize}
              total={claimsQ.data?.total || 0}
              onPageChange={setClaimPage}
              onPageSizeChange={(s) => { setClaimPageSize(s); setClaimPage(1); }}
            />
          </>
        )}
      </div>

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
