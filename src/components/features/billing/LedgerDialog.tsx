"use client";
// Patient package ledger: transactions, adjustments and cancellation.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { patientName, type PatientPackageItem } from "./billing-shared";

interface PackageTx {
  id: string;
  type: string;
  sessions: number;
  amountCents?: number | null;
  description?: string | null;
  createdAt: string;
}

// ---- Ledger + adjust + cancel ----
export function LedgerDialog({
  patientPackageId,
  open,
  onClose,
}: {
  patientPackageId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [adjustType, setAdjustType] = useState("REVERSAL");
  const [adjustSessions, setAdjustSessions] = useState("1");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const detailQ = useQuery({
    queryKey: ["billing", "patient-package", patientPackageId],
    queryFn: () => apiFetch<{ patientPackage: PatientPackageItem & { transactions: PackageTx[]; invoice?: { id: string; invoiceNumber: string; status: string; totalCents: number; paidCents: number } | null } }>(`/api/patient-packages/${patientPackageId}`),
    enabled: open && !!patientPackageId,
  });
  const pp = detailQ.data?.patientPackage;

  const adjustM = useMutation({
    mutationFn: () =>
      apiFetch(`/api/patient-packages/${patientPackageId}/adjust`, {
        method: "POST",
        json: {
          type: adjustType,
          sessions: (adjustType === "REVERSAL" ? 1 : -1) * Math.abs(parseInt(adjustSessions, 10) || 0),
          description: adjustDescription.trim() || undefined,
          reason: adjustReason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Adjustment recorded");
      qc.invalidateQueries({ queryKey: ["billing"] });
      setAdjustOpen(false);
      setAdjustReason("");
      setAdjustDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelM = useMutation({
    mutationFn: () => apiFetch(`/api/patient-packages/${patientPackageId}`, { method: "PATCH", json: { action: "cancel" } }),
    onSuccess: () => {
      toast.success("Package cancelled");
      qc.invalidateQueries({ queryKey: ["billing"] });
      setCancelOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Package ledger — {pp ? pp.package.name : ""}</DialogTitle>
            <DialogDescription>{pp ? `${patientName(pp.patient)} · purchased ${formatDate(pp.purchaseDate)} · expires ${formatDate(pp.expiryDate)}` : ""}</DialogDescription>
          </DialogHeader>
          {detailQ.isLoading || !pp ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="text-lg font-semibold">{pp.usedSessions}/{pp.totalSessions}</p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-lg font-semibold text-teal-700">{pp.remaining}</p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="text-lg font-semibold">{formatMoney(pp.amountPaidCents)}</p>
                </div>
              </div>

              {pp.invoice ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span>Linked invoice <span className="font-medium">{pp.invoice.invoiceNumber}</span></span>
                  <StatusBadge status={pp.invoice.status} />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>Adjust sessions</Button>
                {pp.status !== "CANCELLED" && (
                  <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setCancelOpen(true)}>
                    Cancel package
                  </Button>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Transactions</p>
                {pp.transactions.length === 0 ? (
                  <EmptyStateCompact text="No transactions recorded." />
                ) : (
                  <ol className="relative space-y-3 border-l pl-4">
                    {pp.transactions.map((tx) => (
                      <li key={tx.id} className="relative">
                        <span className="absolute -left-5.25 top-1.5 h-2.5 w-2.5 rounded-full bg-teal-500" />
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={tx.type === "PURCHASE" ? "bg-teal-50 text-teal-700" : tx.type === "DEDUCTION" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}>
                            {labelize(tx.type)}
                          </Badge>
                          <span className={`text-sm font-semibold tabular-nums ${tx.sessions > 0 ? "text-emerald-700" : tx.sessions < 0 ? "text-rose-600" : ""}`}>
                            {tx.sessions > 0 ? `+${tx.sessions}` : tx.sessions} sessions
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</span>
                        </div>
                        {tx.description ? <p className="mt-0.5 text-xs text-muted-foreground">{tx.description}</p> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust package sessions</DialogTitle>
            <DialogDescription>
              REVERSAL returns sessions to the patient; ADJUSTMENT consumes sessions manually. An admin reason is required and audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={adjustType} onValueChange={setAdjustType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REVERSAL">Reversal (return sessions)</SelectItem>
                  <SelectItem value="ADJUSTMENT">Adjustment (consume sessions)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sessions</Label>
              <Input type="number" min={1} value={adjustSessions} onChange={(e) => setAdjustSessions(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={adjustDescription} onChange={(e) => setAdjustDescription(e.target.value)} placeholder="e.g. session missed by therapist" />
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Why is this adjustment needed?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={() => adjustM.mutate()} disabled={adjustM.isPending || (parseInt(adjustSessions, 10) || 0) < 1 || adjustReason.trim().length < 3}>
              {adjustM.isPending ? "Saving…" : "Record adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this patient package?</AlertDialogTitle>
            <AlertDialogDescription>
              Remaining sessions become unusable and a CANCELLED entry is written to the ledger. This action is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep package</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={cancelM.isPending} onClick={(e) => { e.preventDefault(); cancelM.mutate(); }}>
              Cancel package
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyStateCompact({ text }: { text: string }) {
  return <p className="px-4 py-5 text-center text-sm text-muted-foreground">{text}</p>;
}
