"use client";
// Invoice action dialogs: record payment, refund, create insurance claim, record insurer payment.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";



import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHODS, labelize } from "@/lib/constants";
import { inputToCents, centsToInput, type InvoiceDetail, type ProviderLite } from "./billing-shared";

export function RecordPaymentDialog({
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

export function RefundDialog({
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

export function CreateClaimDialog({
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

export function ClaimInsurancePaymentDialog({
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
