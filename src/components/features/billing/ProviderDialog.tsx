"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api-client";
import { labelize } from "@/lib/constants";
import { type ProviderLite } from "./billing-shared";
import { Field } from "@/components/molecules/field";

// ---- Provider add/edit ----
export function ProviderDialog({
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
        <div className="grid gap-3 sm:grid-cols-2 *:min-w-0">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Glory Health Insurance" />
          </Field>
          <Field label="Code" required>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="GHI" disabled={!!initial} />
          </Field>
          <Field label="Contact person">
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="Contact phone">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="claims@provider.com" />
          </Field>
          <Field label="Billing arrangement">
            <Select value={billingArrangement} onValueChange={setBillingArrangement}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["DIRECT_BILLING", "REIMBURSEMENT", "CAPITATION"].map((x) => <SelectItem key={x} value={x}>{labelize(x)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Default coverage (%)">
            <Input type="number" min={0} max={100} value={coverage} onChange={(e) => setCoverage(e.target.value)} />
          </Field>
          <Field label="Active">
            <div className="flex h-10 items-center"><Switch checked={active} onCheckedChange={setActive} /></div>
          </Field>
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

