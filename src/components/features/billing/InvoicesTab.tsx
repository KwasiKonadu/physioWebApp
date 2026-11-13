"use client";
// ============ Invoices tab: filters + list + new invoice builder + detail sheet ============
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { TablePagination } from "@/components/molecules/table-pagination";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { useAuthStore, hasPermission, useUIStore } from "@/stores/app-store";
import { PERMS, INVOICE_STATUSES, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import {
  ArrangementBadge, PatientPicker, centsToInput, inputToCents, patientName,
  type ListResponse, type InvoiceListItem, type ServiceLite, type ProviderLite, type PatientLite,
} from "./billing-shared";
import InvoiceDetailSheet from "./InvoiceDetail";

interface InvoiceStatsPayload {
  stats: {
    outstandingCount: number;
    outstandingCents: number;
    paidThisMonthCents: number;
  };
}

interface EpisodeLite { id: string; title: string; episodeNumber?: number; status?: string }

// ---- One billable line in the builder ----
interface DraftItem {
  key: number;
  serviceId: string;
  description: string;
  quantity: number;
  priceText: string; // GHS
  ratePreview?: { rateCents: number; coveragePercent: number } | null;
}

let itemKey = 1;
const emptyItem = (): DraftItem => ({ key: itemKey++, serviceId: "", description: "", quantity: 1, priceText: "", ratePreview: null });

function NewInvoiceDialog({
  open,
  onClose,
  prefillPatientId,
}: {
  open: boolean;
  onClose: (created?: boolean) => void;
  prefillPatientId?: string | null;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.billingManage);

  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [episodeId, setEpisodeId] = useState<string>("");
  const [arrangement, setArrangement] = useState<string>("PAYG");
  const [providerId, setProviderId] = useState<string>("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [discountText, setDiscountText] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [issueNow, setIssueNow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const servicesQ = useQuery({
    queryKey: ["billing", "services-active"],
    queryFn: () => apiFetch<ListResponse<ServiceLite>>("/api/services?active=true&pageSize=200"),
    enabled: open,
  });
  const providersQ = useQuery({
    queryKey: ["billing", "providers-active"],
    queryFn: () => apiFetch<ListResponse<ProviderLite>>("/api/insurance/providers?active=true&pageSize=100"),
    enabled: open && arrangement === "INSURANCE",
  });
  const ratesQ = useQuery({
    queryKey: ["billing", "provider-rates", providerId],
    queryFn: () => apiFetch<{ items: { serviceId: string; rateCents: number; coveragePercent: number }[] }>(`/api/insurance/providers/${providerId}/rates`),
    enabled: open && arrangement === "INSURANCE" && !!providerId,
  });
  // best-effort episode lookup from the patients module (shape tolerated)
  const patientDetailQ = useQuery({
    queryKey: ["billing", "patient-episodes", patient?.id],
    queryFn: async () => {
      try {
        return await apiFetch<Record<string, unknown>>(`/api/patients/${patient!.id}`);
      } catch {
        return null;
      }
    },
    enabled: open && !!patient,
    staleTime: 30_000,
  });

  // prefill patient by id (from cross-module navigation)
  useEffect(() => {
    if (!open || !prefillPatientId || patient) return;
    apiFetch<{ patient?: PatientLite } | PatientLite>(`/api/patients/${prefillPatientId}`)
      .then((data) => {
        const p = (data as { patient?: PatientLite }).patient || (data as PatientLite);
        if (p && p.id) setPatient(p);
      })
      .catch(() => undefined);
  }, [open, prefillPatientId, patient]);

  const episodes: EpisodeLite[] = useMemo(() => {
    const d = patientDetailQ.data as Record<string, unknown> | null | undefined;
    if (!d) return [];
    const raw = (d.episodes || (d.patient as Record<string, unknown> | undefined)?.episodes) as EpisodeLite[] | undefined;
    return Array.isArray(raw) ? raw : [];
  }, [patientDetailQ.data]);

  const rates = useMemo(() => new Map((ratesQ.data?.items || []).map((r) => [r.serviceId, r])), [ratesQ.data]);
  const services = servicesQ.data?.items || [];

  const updateItem = (key: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => {
      if (it.key !== key) return it;
      const next = { ...it, ...patch };
      // insurance rate preview + negotiated price
      if (arrangement === "INSURANCE" && providerId && next.serviceId && rates.has(next.serviceId)) {
        const r = rates.get(next.serviceId)!;
        next.ratePreview = { rateCents: r.rateCents, coveragePercent: r.coveragePercent };
        next.priceText = String(r.rateCents / 100);
      } else {
        next.ratePreview = null;
        if (patch.serviceId !== undefined) {
          const svc = services.find((s) => s.id === next.serviceId);
          next.description = svc ? svc.name : next.description;
          next.priceText = svc ? String(svc.standardPriceCents / 100) : next.priceText;
        }
      }
      return next;
    }));
  };

  const subtotalCents = items.reduce((s, it) => {
    const unit = inputToCents(it.priceText);
    return s + unit * (it.quantity || 0);
  }, 0);
  const discountCents = Math.min(inputToCents(discountText), subtotalCents);
  const totalCents = subtotalCents - discountCents;
  const coveredCents = arrangement === "INSURANCE"
    ? items.reduce((s, it) => {
        if (!it.ratePreview) return s;
        return s + Math.round((it.ratePreview.rateCents * (it.quantity || 0) * it.ratePreview.coveragePercent) / 100);
      }, 0)
    : 0;
  const patientDue = totalCents - coveredCents;

  const createM = useMutation({
    mutationFn: () => {
      if (!patient) throw new Error("Select a patient");
      const payloadItems = items
        .filter((it) => it.description.trim() && it.quantity > 0)
        .map((it) => ({
          serviceId: it.serviceId || undefined,
          description: it.description.trim(),
          quantity: it.quantity,
          unitPriceCents: inputToCents(it.priceText),
          providerId: arrangement === "INSURANCE" && providerId ? providerId : undefined,
        }));
      if (payloadItems.length === 0) throw new Error("Add at least one line item");
      return apiFetch<{ invoice: InvoiceListItem }>("/api/invoices", {
        method: "POST",
        json: {
          patientId: patient.id,
          episodeId: episodeId || undefined,
          arrangement,
          items: payloadItems,
          discountCents: discountCents,
          notes: notes.trim() || undefined,
          dueDate: dueDate || undefined,
          issue: issueNow,
        },
      });
    },
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoice.invoiceNumber} ${data.invoice.status === "DRAFT" ? "saved as draft" : "issued"}`);
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose(true);
    },
    onError: (e: Error) => setError(e.message),
  });

  const reset = () => {
    setPatient(null);
    setEpisodeId("");
    setArrangement("PAYG");
    setProviderId("");
    setItems([emptyItem()]);
    setDiscountText("");
    setNotes("");
    setDueDate("");
    setIssueNow(true);
    setError(null);
  };

  const close = (created?: boolean) => {
    onClose(created);
    if (created) reset();
  };

  if (!canManage) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>Bill services pay-as-you-go, as a package purchase or through an insurance provider.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={(p) => { setPatient(p); setEpisodeId(""); }} />
          </div>
          {episodes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Episode (optional)</Label>
              <Select value={episodeId} onValueChange={setEpisodeId}>
                <SelectTrigger><SelectValue placeholder="No episode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No episode</SelectItem>
                  {episodes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title || `Episode ${e.episodeNumber ?? ""}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Arrangement *</Label>
            <Select value={arrangement} onValueChange={(v) => { setArrangement(v); setProviderId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_ARRANGEMENTS.map((a) => <SelectItem key={a} value={a}>{labelize(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {arrangement === "INSURANCE" && (
            <div className="space-y-1.5">
              <Label>Insurance provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger><SelectValue placeholder="Select provider…" /></SelectTrigger>
                <SelectContent>
                  {(providersQ.data?.items || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Lines with a negotiated rate are priced and covered server-side.</p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line items *</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.key} className="grid gap-2 rounded-lg border p-2.5 sm:grid-cols-[1fr_90px_130px_36px] sm:items-center">
                <div className="space-y-1">
                  <Select
                    value={it.serviceId || undefined}
                    onValueChange={(v) => updateItem(it.key, { serviceId: v === "custom" ? "" : v })}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Service…" /></SelectTrigger>
                    <SelectContent className="custom-scrollbar max-h-64">
                      <SelectItem value="custom">Custom item (type description)</SelectItem>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {formatMoney(s.standardPriceCents)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9"
                    placeholder="Description *"
                    value={it.description}
                    onChange={(e) => updateItem(it.key, { description: e.target.value })}
                  />
                  {it.ratePreview ? (
                    <p className="text-xs text-sky-700">
                      Negotiated {formatMoney(it.ratePreview.rateCents)} · covers {it.ratePreview.coveragePercent}%
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Qty</Label>
                  <Input
                    type="number" min={1} className="h-9"
                    value={String(it.quantity)}
                    onChange={(e) => updateItem(it.key, { quantity: Math.max(1, parseInt(e.target.value || "1", 10) || 1) })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Unit price ₵</Label>
                  <Input
                    type="number" min={0} step="0.01" className="h-9" disabled={!!it.ratePreview}
                    value={it.priceText}
                    onChange={(e) => updateItem(it.key, { priceText: e.target.value })}
                  />
                  <p className="text-right text-xs tabular-nums text-muted-foreground">
                    {formatMoney(inputToCents(it.priceText) * it.quantity)}
                  </p>
                </div>
                <Button
                  type="button" variant="ghost" size="icon" aria-label="Remove line"
                  disabled={items.length === 1}
                  onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Discount (₵)</Label>
            <Input type="number" min={0} step="0.01" value={discountText} onChange={(e) => setDiscountText(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes on this invoice" />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(subtotalCents)}</span></div>
          {discountCents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-rose-600">-{formatMoney(discountCents)}</span></div>}
          {arrangement === "INSURANCE" && coveredCents > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Insurance covers</span><span className="tabular-nums text-sky-700">-{formatMoney(coveredCents)}</span></div>
          )}
          <div className="mt-1 flex justify-between border-t pt-1.5 font-semibold">
            <span>{arrangement === "INSURANCE" ? "Patient pays" : "Total"}</span>
            <span className="tabular-nums">{formatMoney(arrangement === "INSURANCE" ? patientDue : totalCents)}</span>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={issueNow} onCheckedChange={(v) => setIssueNow(!!v)} /> Issue now (else saved as draft)
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => { setError(null); createM.mutate(); }} disabled={createM.isPending}>
              {createM.isPending ? "Saving…" : "Create invoice"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InvoicesTab({ prefillPatientId }: { prefillPatientId?: string | null }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.billingManage);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [arrangement, setArrangement] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // open the detail sheet directly when navigated with invoiceId
  useEffect(() => {
    const t = setTimeout(() => {
      const opts = useUIStore.getState().navOpts;
      if (opts?.invoiceId) setDetailId(opts.invoiceId);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) p.set("search", search.trim());
    if (status !== "all") p.set("status", status);
    if (arrangement !== "all") p.set("arrangement", arrangement);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [page, pageSize, search, status, arrangement, from, to]);

  const listQ = useQuery({
    queryKey: ["billing", "invoices", params],
    queryFn: () => apiFetch<ListResponse<InvoiceListItem> & InvoiceStatsPayload>(`/api/invoices?${params}`),
  });

  const rows = listQ.data?.items || [];
  const outstanding = listQ.data?.stats;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Invoice no. or patient…" }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["billing", "invoices"] })}
          refreshing={listQ.isFetching}
          filters={
            <>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={arrangement} onValueChange={(v) => { setArrangement(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Arrangement" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All arrangements</SelectItem>
                  {PAYMENT_ARRANGEMENTS.map((a) => <SelectItem key={a} value={a}>{labelize(a)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-9 w-[140px]" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="Issued from" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" className="h-9 w-[140px]" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Issued to" />
              </div>
            </>
          }
        >
          {outstanding ? (
            <span className="mr-1 hidden rounded-md border bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 md:inline">
              Outstanding {formatMoney(outstanding.outstandingCents)} · {outstanding.outstandingCount} invoices
            </span>
          ) : null}
        </DataToolbar>
        {canManage ? (
          <Button onClick={() => setNewOpen(true)}>
            New invoice
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        {listQ.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon="Receipt"
              title="No invoices found"
              description={search || status !== "all" || arrangement !== "all" || from || to ? "Try adjusting the filters." : "Issue your first invoice to get started."}
            />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead className="hidden md:table-cell">Episode</TableHead>
                  <TableHead>Arrangement</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Issued</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => setDetailId(inv.id)}>
                    <TableCell className="font-medium">
                      {inv.invoiceNumber}
                      {inv.claim ? <Badge variant="outline" className="ml-1.5 text-[10px]">{inv.claim.claimNumber}</Badge> : null}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{patientName(inv.patient)}</p>
                      <p className="text-xs text-muted-foreground">{inv.patient.patientCode}</p>
                    </TableCell>
                    <TableCell className="hidden max-w-[160px] truncate text-sm text-muted-foreground md:table-cell">
                      {inv.episode ? inv.episode.title : "—"}
                    </TableCell>
                    <TableCell><ArrangementBadge arrangement={inv.arrangement} /></TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(inv.totalCents)}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">{formatMoney(inv.paidCents)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(inv.totalCents - inv.paidCents)}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{formatDate(inv.issuedAt)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" onClick={() => setDetailId(inv.id)}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={listQ.data?.total || 0}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </>
        )}
      </div>

      <NewInvoiceDialog open={newOpen} onClose={(created) => { setNewOpen(false); void created; }} prefillPatientId={prefillPatientId} />
      {detailId ? (
        <InvoiceDetailSheet
          invoiceId={detailId}
          open={!!detailId}
          onClose={() => { setDetailId(null); qc.invalidateQueries({ queryKey: ["billing", "invoices"] }); }}
        />
      ) : null}
    </div>
  );
}
