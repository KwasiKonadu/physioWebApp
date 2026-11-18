"use client";
// Sell / assign a package to a patient.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, fromCents } from "@/lib/format";
import { PAYMENT_METHODS, labelize } from "@/lib/constants";
import { PatientPicker, inputToCents, dateInputValue, type ListResponse, type PackageDef, type PatientLite } from "./billing-shared";
import { Field } from "@/components/molecules/field";

// ---- Assign (sell) a package to a patient ----
export function AssignPackageDialog({
  open,
  onClose,
  prefillPatientId,
}: {
  open: boolean;
  onClose: () => void;
  prefillPatientId?: string | null;
}) {
  const qc = useQueryClient();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [packageId, setPackageId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => dateInputValue(new Date()));
  const [amountText, setAmountText] = useState("");
  const [createInvoice, setCreateInvoice] = useState(true);
  const [method, setMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const defsQ = useQuery({
    queryKey: ["billing", "package-defs"],
    queryFn: () => apiFetch<ListResponse<PackageDef>>("/api/packages?active=true&pageSize=100"),
    enabled: open,
  });

  // prefill patient (cross-module navigation)
  useEffect(() => {
    if (!open || !prefillPatientId || patient) return;
    apiFetch<{ patient?: PatientLite } | PatientLite>(`/api/patients/${prefillPatientId}`)
      .then((data) => {
        const p = (data as { patient?: PatientLite }).patient || (data as PatientLite);
        if (p && p.id) setPatient(p);
      })
      .catch(() => undefined);
  }, [open, prefillPatientId, patient]);

  const selectedPkg = (defsQ.data?.items || []).find((p) => p.id === packageId) || null;

  const onPackageSelect = (id: string) => {
    setPackageId(id);
    const pkg = (defsQ.data?.items || []).find((p) => p.id === id) || null;
    if (pkg) setAmountText(String(fromCents(pkg.priceCents)));
  };

  const purchaseM = useMutation({
    mutationFn: () => {
      if (!patient) throw new Error("Select a patient");
      if (!selectedPkg) throw new Error("Select a package");
      return apiFetch("/api/patient-packages", {
        method: "POST",
        json: {
          patientId: patient.id,
          packageId: selectedPkg.id,
          purchaseDate: purchaseDate || undefined,
          amountPaidCents: amountText === "" ? selectedPkg.priceCents : inputToCents(amountText),
          createInvoice,
          method: createInvoice ? method : undefined,
          notes: notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Package assigned to patient");
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["package-balance"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign package to patient</DialogTitle>
          <DialogDescription>Creates the patient package, its PURCHASE ledger entry and optionally an invoice + payment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Patient" required>
            <PatientPicker value={patient} onChange={setPatient} />
          </Field>
          <Field label="Package" required>
            <Select value={packageId} onValueChange={onPackageSelect}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select package…" /></SelectTrigger>
              <SelectContent className="custom-scrollbar max-h-64">
                {(defsQ.data?.items || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.sessions} sessions · {formatMoney(p.priceCents)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPkg ? (
              <p className="text-xs text-muted-foreground">Valid {selectedPkg.validityDays} days from purchase.</p>
            ) : null}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2 *:min-w-0">
            <Field label="Purchase date">
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </Field>
            <Field label="Amount paid (₵)">
              <Input type="number" min={0} step="0.01" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder={selectedPkg ? String(fromCents(selectedPkg.priceCents)) : "0.00"} />
            </Field>
          </div>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Checkbox checked={createInvoice} onCheckedChange={(v) => setCreateInvoice(!!v)} />
            <span>
              Create invoice for this purchase
              <span className="block text-xs text-muted-foreground">Records a payment against it when the amount paid is greater than zero.</span>
            </span>
          </label>
          {createInvoice && (
            <Field label="Payment method">
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.filter((x) => x !== "INSURANCE").map((x) => <SelectItem key={x} value={x}>{labelize(x)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(null); purchaseM.mutate(); }} disabled={purchaseM.isPending || !patient || !selectedPkg}>
            {purchaseM.isPending ? "Assigning…" : "Assign package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
