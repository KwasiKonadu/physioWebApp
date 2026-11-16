"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { inputToCents, centsToInput, type ClaimItem } from "./billing-shared";

// ---- Claim decision / settlement dialog ----
export function ClaimActionDialog({
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

export function RejectClaimDialog({ claim, open, onClose }: { claim: ClaimItem; open: boolean; onClose: () => void }) {
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

