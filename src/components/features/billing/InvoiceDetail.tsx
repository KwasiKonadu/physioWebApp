"use client";
// ============ Invoice detail sheet: items, payments, refunds, claim actions ============
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { DataTable } from "@/components/molecules/data-table";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDateTime, relativeTime } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, labelize } from "@/lib/constants";
import { patientShare } from "@/lib/invoice-share";
import { ArrangementBadge, patientName, type InvoiceDetail } from "./billing-shared";
import { RecordPaymentDialog, RefundDialog, CreateClaimDialog, ClaimInsurancePaymentDialog } from "./InvoiceDialogs";

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

  const pShare = patientShare(invoice ? { ...invoice, claimStatus: invoice.claim?.status } : { totalCents: 0, insuranceCoveredCents: 0, arrangement: "", payments: [] });

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
              <DataTable
                bare
                maxHeight="max-h-none"
                minWidth="min-w-0"
                rows={invoice.items}
                rowKey={(it) => it.id}
                columns={[
                  {
                    id: "desc", header: "Description", className: "max-w-55",
                    cell: (it) => (
                      <>
                        <p className="truncate text-sm">{it.description}</p>
                        {it.coveredCents > 0 ? <p className="text-xs text-sky-700">Covered {formatMoney(it.coveredCents)}</p> : null}
                      </>
                    ),
                  },
                  { id: "qty", header: "Qty", align: "right", cell: (it) => it.quantity },
                  { id: "unit", header: "Unit", align: "right", cell: (it) => <span className="tabular-nums">{formatMoney(it.unitPriceCents)}</span> },
                  ...(invoice.arrangement === "INSURANCE"
                    ? [{
                        id: "rate", header: "Rate / Cover", align: "right" as const,
                        cell: (it: (typeof invoice.items)[number]) => (
                          <span className="text-xs">
                            {it.appliedRateCents !== null && it.appliedRateCents !== undefined ? (
                              <>
                                {formatMoney(it.appliedRateCents)}
                                {it.coveragePercent !== null && it.coveragePercent !== undefined ? ` · ${it.coveragePercent}%` : ""}
                              </>
                            ) : "—"}
                          </span>
                        ),
                      }]
                    : []),
                  { id: "total", header: "Total", align: "right", cell: (it) => <span className="tabular-nums">{formatMoney(it.unitPriceCents * it.quantity)}</span> },
                ]}
              />
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
                {pShare.insured && (
                  <div className="flex justify-between font-semibold"><span>Patient pays (co-pay)</span><span className="tabular-nums">{formatMoney(pShare.shareCents)}</span></div>
                )}
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
            <RecordPaymentDialog invoice={invoice} open={payOpen} onClose={() => setPayOpen(false)} defaultAmountCents={pShare.insured ? pShare.remainingCents : invoice.totalCents - invoice.paidCents} />
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
