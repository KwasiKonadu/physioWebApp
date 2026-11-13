"use client";
// ============ Invoice detail sheet: items, payments, refunds, claim actions ============
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDateTime, relativeTime } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, PAYMENT_METHODS, labelize } from "@/lib/constants";
import {
  ArrangementBadge, patientName, inputToCents, centsToInput,
  type InvoiceDetail, type ProviderLite,
} from "./billing-shared";

function RecordPaymentDialog({
  invoice,
  open,
  onClose,
  defaultAmountCents,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
  defaultAmountCents: number;
}) {
  const qc = useQueryClient();
  const [amountText, setAmountText] = useState(() => centsToInput(defaultAmountCents));
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: () =>
      apiFetch(`/api/invoices/${invoice.id}/payments`, {
        method: "POST",
        json: { amountCents: inputToCents(amountText), method, reference: reference.trim() || undefined, notes: notes.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment — {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount (₵)</Label>
            <Input type="number" min={0} step="0.01" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Outstanding balance {formatMoney(invoice.totalCents - invoice.paidCents)} · partial payments supported
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.filter((x) => x !== "INSURANCE").map((x) => <SelectItem key={x} value={x}>{labelize(x)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Receipt / transaction ref (optional)" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || inputToCents(amountText) <= 0}>
            {m.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amountText, setAmountText] = useState(() => centsToInput(invoice.paidCents));
  const [reason, setReason] = useState("");

  const m = useMutation({
    mutationFn: () =>
      apiFetch(`/api/invoices/${invoice.id}/refunds`, {
        method: "POST",
        json: { amountCents: inputToCents(amountText), reason: reason.trim(), paymentId: undefined },
      }),
    onSuccess: () => {
      toast.success("Refund recorded");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Issue a refund — {invoice.invoiceNumber}</AlertDialogTitle>
          <AlertDialogDescription>
            A separate refund record is created (payments are never deleted) and the invoice status is recalculated.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Refund amount (₵)</Label>
            <Input type="number" min={0} step="0.01" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            <p className="text-xs text-muted-foreground">Maximum {formatMoney(invoice.paidCents)} (amount paid)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this refund being issued?" />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-rose-600 hover:bg-rose-700"
            disabled={m.isPending || inputToCents(amountText) <= 0 || reason.trim().length < 3}
            onClick={(e) => { e.preventDefault(); m.mutate(); }}
          >
            {m.isPending ? "Processing…" : "Issue refund"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateClaimDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [providerId, setProviderId] = useState("");
  const [notes, setNotes] = useState("");
  const providersQ = useQuery({
    queryKey: ["billing", "providers-all"],
    queryFn: () => apiFetch<{ items: ProviderLite[] }>("/api/insurance/providers?pageSize=100"),
    enabled: open,
  });

  const m = useMutation({
    mutationFn: () =>
      apiFetch<{ claim: { claimNumber: string } }>("/api/insurance/claims", {
        method: "POST",
        json: { invoiceId: invoice.id, providerId: providerId || undefined, notes: notes.trim() || undefined },
      }),
    onSuccess: (data: { claim: { claimNumber: string } }) => {
      toast.success(`Claim ${data.claim.claimNumber} created`);
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create insurance claim</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{invoice.invoiceNumber}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Claimable (covered)</span><span className="font-medium tabular-nums text-sky-700">{formatMoney(invoice.insuranceCoveredCents)}</span></div>
          </div>
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Auto-detect from invoice rates" /></SelectTrigger>
              <SelectContent>
                {(providersQ.data?.items || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Leave unset to infer from the rates applied on the invoice.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Creating…" : "Create claim"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClaimInsurancePaymentDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const claim = invoice.claim ?? null;
  const remaining = invoice.totalCents - invoice.paidCents;
  const [amountText, setAmountText] = useState(() =>
    centsToInput(claim ? Math.min(remaining, claim.claimedCents - (claim.approvedCents || 0)) || remaining : remaining));
  const [reference, setReference] = useState(claim?.claimNumber ?? "");

  const m = useMutation({
    mutationFn: () =>
      apiFetch(`/api/insurance/claims/${claim?.id}`, {
        method: "PATCH",
        json: { action: "record_payment", amountCents: inputToCents(amountText), reference: reference.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success("Insurance payment recorded");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!claim) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record insurance payment — {claim.claimNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount received (₵)</Label>
            <Input type="number" min={0} step="0.01" value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            <p className="text-xs text-muted-foreground">Outstanding on invoice {formatMoney(remaining)}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || inputToCents(amountText) <= 0}>
            {m.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InvoiceDetailSheet({
  invoiceId,
  open,
  onClose,
}: {
  invoiceId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.billingManage);
  const canRefund = hasPermission(user, PERMS.billingRefund);

  const [payOpen, setPayOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [insPayOpen, setInsPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const detailQ = useQuery({
    queryKey: ["billing", "invoice-detail", invoiceId],
    queryFn: () => apiFetch<{ invoice: InvoiceDetail }>(`/api/invoices/${invoiceId}`),
    enabled: open,
  });
  const invoice = detailQ.data?.invoice;

  const actionM = useMutation({
    mutationFn: (payload: { action: "issue" | "cancel"; reason?: string }) =>
      apiFetch(`/api/invoices/${invoiceId}`, { method: "PATCH", json: payload }),
    onSuccess: (_data, vars) => {
      toast.success(vars.action === "issue" ? "Invoice issued" : "Invoice cancelled");
      qc.invalidateQueries({ queryKey: ["billing"] });
      setCancelOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totals = useMemo(() => {
    if (!invoice) return null;
    return {
      balance: invoice.totalCents - invoice.paidCents,
      canCancel: ["DRAFT", "UNPAID"].includes(invoice.status) && invoice.payments.length === 0 && invoice.refunds.length === 0 && !invoice.claim,
    };
  }, [invoice]);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto custom-scrollbar sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {invoice ? invoice.invoiceNumber : "Invoice"}
            {invoice && <StatusBadge status={invoice.status} />}
            {invoice && <ArrangementBadge arrangement={invoice.arrangement} />}
          </SheetTitle>
          <SheetDescription>
            {invoice ? `${patientName(invoice.patient)} · ${invoice.patient.patientCode}` : "Loading invoice…"}
          </SheetDescription>
        </SheetHeader>

        {detailQ.isLoading || !invoice ? (
          <div className="space-y-3 px-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4 px-4 pb-8">
            <div className="flex flex-wrap gap-2">
              {invoice.status === "DRAFT" && canManage && (
                <Button size="sm" onClick={() => actionM.mutate({ action: "issue" })} disabled={actionM.isPending}>Issue invoice</Button>
              )}
              {invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" && invoice.status !== "PAID" && canManage && (
                <Button size="sm" onClick={() => setPayOpen(true)}>Record payment</Button>
              )}
              {invoice.paidCents > 0 && invoice.status !== "CANCELLED" && canRefund && (
                <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setRefundOpen(true)}>Refund</Button>
              )}
              {totals?.canCancel && canManage && (
                <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setCancelOpen(true)}>Cancel invoice</Button>
              )}
              {invoice.arrangement === "INSURANCE" && invoice.insuranceCoveredCents > 0 && !invoice.claim && ["UNPAID", "PARTIAL", "PAID"].includes(invoice.status) && canManage && (
                <Button size="sm" variant="outline" onClick={() => setClaimOpen(true)}>Create claim</Button>
              )}
            </div>

            <SectionCard title="Summary" icon="FileText">
              <DetailGrid>
                <DetailRow label="Patient" value={`${patientName(invoice.patient)} (${invoice.patient.patientCode})`} />
                <DetailRow label="Episode" value={invoice.episode ? `${invoice.episode.title} (#${invoice.episode.episodeNumber})` : "—"} />
                <DetailRow label="Issued" value={formatDateTime(invoice.issuedAt)} />
                <DetailRow label="Due date" value={invoice.dueDate ? formatDateTime(invoice.dueDate) : "—"} />
                <DetailRow label="Notes" value={invoice.notes || "—"} />
              </DetailGrid>
            </SectionCard>

            <SectionCard title="Line items" icon="List" description="Historical prices and insurance rates as billed" noPadding>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    {invoice.arrangement === "INSURANCE" && <TableHead className="text-right">Rate / Cover</TableHead>}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate text-sm">{it.description}</p>
                        {it.coveredCents > 0 ? <p className="text-xs text-sky-700">Covered {formatMoney(it.coveredCents)}</p> : null}
                      </TableCell>
                      <TableCell className="text-right">{it.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(it.unitPriceCents)}</TableCell>
                      {invoice.arrangement === "INSURANCE" && (
                        <TableCell className="text-right text-xs">
                          {it.appliedRateCents !== null && it.appliedRateCents !== undefined ? (
                            <>
                              {formatMoney(it.appliedRateCents)}
                              {it.coveragePercent !== null && it.coveragePercent !== undefined ? ` · ${it.coveragePercent}%` : ""}
                            </>
                          ) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums">{formatMoney(it.unitPriceCents * it.quantity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Separator />
              <div className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(invoice.subtotalCents)}</span></div>
                {invoice.discountCents > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-rose-600">-{formatMoney(invoice.discountCents)}</span></div>
                )}
                {invoice.insuranceCoveredCents > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Insurance covers</span><span className="tabular-nums text-sky-700">-{formatMoney(invoice.insuranceCoveredCents)}</span></div>
                )}
                <div className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(invoice.totalCents)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="tabular-nums text-emerald-700">{formatMoney(invoice.paidCents)}</span></div>
                <div className="flex justify-between font-semibold">
                  <span>Balance</span>
                  <span className={`tabular-nums ${invoice.totalCents - invoice.paidCents > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {formatMoney(invoice.totalCents - invoice.paidCents)}
                  </span>
                </div>
              </div>
            </SectionCard>

            {invoice.claim ? (
              <SectionCard
                title="Insurance claim"
                icon="ShieldCheck"
                description={`${invoice.claim.claimNumber} · ${invoice.claim.provider?.name || ""}`}
                actions={<StatusBadge status={invoice.claim.status} />}
              >
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Claimed</span><span className="tabular-nums">{formatMoney(invoice.claim.claimedCents)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span className="tabular-nums">{formatMoney(invoice.claim.approvedCents)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Submitted</span>
                    <span>{invoice.claim.submittedDate ? formatDateTime(invoice.claim.submittedDate) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Decision</span>
                    <span>{invoice.claim.decisionDate ? formatDateTime(invoice.claim.decisionDate) : "—"}</span>
                  </div>
                  {invoice.claim.notes ? <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{invoice.claim.notes}</p> : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {invoice.claim.status === "DRAFT" && canManage && (
                      <Button
                        size="sm" variant="outline"
                        onClick={() => apiFetch(`/api/insurance/claims/${invoice.claim!.id}`, { method: "PATCH", json: { action: "submit" } })
                          .then(() => { toast.success("Claim submitted"); qc.invalidateQueries({ queryKey: ["billing"] }); })
                          .catch((e: Error) => toast.error(e.message))}
                      >
                        Submit claim
                      </Button>
                    )}
                    {invoice.claim.status !== "PAID" && invoice.totalCents - invoice.paidCents > 0 && ["UNPAID", "PARTIAL"].includes(invoice.status) && canManage && (
                      <Button size="sm" variant="outline" onClick={() => setInsPayOpen(true)}>Record insurance payment</Button>
                    )}
                    <span className="text-xs text-muted-foreground">Manage decisions in the Insurance tab.</span>
                  </div>
                </div>
              </SectionCard>
            ) : null}

            <SectionCard title={`Payments (${invoice.payments.length})`} icon="Wallet" noPadding>
              {invoice.payments.length === 0 ? (
                <div className="p-4"><EmptyStateCompact text="No payments recorded yet." /></div>
              ) : (
                <ul className="divide-y">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{formatMoney(p.amountCents)} · {labelize(p.method)}</p>
                        <p className="truncate text-xs text-muted-foreground">{formatDateTime(p.paidAt)}{p.reference ? ` · ${p.reference}` : ""}</p>
                      </div>
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700">received {relativeTime(p.paidAt)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title={`Refunds (${invoice.refunds.length})`} icon="Undo2" noPadding>
              {invoice.refunds.length === 0 ? (
                <div className="p-4"><EmptyStateCompact text="No refunds on this invoice." /></div>
              ) : (
                <ul className="divide-y">
                  {invoice.refunds.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-rose-600">-{formatMoney(r.amountCents)}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.reason}</p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(r.refundedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        )}

        {invoice && (
          <>
            <RecordPaymentDialog invoice={invoice} open={payOpen} onClose={() => setPayOpen(false)} defaultAmountCents={invoice.totalCents - invoice.paidCents} />
            <RefundDialog invoice={invoice} open={refundOpen} onClose={() => setRefundOpen(false)} />
            <CreateClaimDialog invoice={invoice} open={claimOpen} onClose={() => setClaimOpen(false)} />
            {invoice.claim ? (
              <ClaimInsurancePaymentDialog invoice={invoice} open={insPayOpen} onClose={() => setInsPayOpen(false)} />
            ) : null}
            <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel {invoice.invoiceNumber}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cancelled invoices are kept for audit but can no longer receive payments. This is only possible while no money has been recorded.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep invoice</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 hover:bg-rose-700"
                    disabled={actionM.isPending}
                    onClick={(e) => { e.preventDefault(); actionM.mutate({ action: "cancel" }); }}
                  >
                    Cancel invoice
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyStateCompact({ text }: { text: string }) {
  return <p className="px-4 py-5 text-center text-sm text-muted-foreground">{text}</p>;
}
