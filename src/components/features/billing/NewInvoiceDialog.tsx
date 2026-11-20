"use client";
// New invoice builder (side panel): patient, episode, arrangement, line items, totals.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import { emptyItem, type DraftItem, type Membership } from "./invoice-draft";
import { InvoiceLineItems } from "./InvoiceLineItems";
import { InsuranceMembershipNote } from "./InsuranceMembershipNote";
import { InvoiceTotals } from "./InvoiceTotals";
import { inputToCents, PatientPicker, type ListResponse, type InvoiceListItem, type ServiceLite, type ProviderLite, type PatientLite } from "./billing-shared";
import { Field } from "@/components/molecules/field";

interface EpisodeLite { id: string; title: string; episodeNumber?: number; status?: string }

export function NewInvoiceDialog({
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
        return await apiFetch<Record<string, unknown>>(`/api/patients/${patient!.id}?view=summary`);
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
    apiFetch<{ patient?: PatientLite } | PatientLite>(`/api/patients/${prefillPatientId}?view=summary`)
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

  // insurance memberships already on the patient's record (captured at registration / profile)
  const memberships: Membership[] = useMemo(() => {
    const d = patientDetailQ.data as Record<string, unknown> | null | undefined;
    const raw = (d?.insurances || (d?.patient as Record<string, unknown> | undefined)?.insurances) as Membership[] | undefined;
    return Array.isArray(raw) ? raw : [];
  }, [patientDetailQ.data]);

  // one active membership → pre-select its provider
  useEffect(() => {
    if (arrangement !== "INSURANCE" || providerId) return;
    const active = memberships.filter((m) => m.status === "ACTIVE");
    // memberships load asynchronously, so the default can only be applied once they arrive
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active.length === 1) setProviderId(active[0].providerId);
  }, [arrangement, providerId, memberships]);

  const selectedMembership = memberships.find((m) => m.providerId === providerId) || null;
  const membershipExpired = !!selectedMembership?.validTo && new Date(selectedMembership.validTo).getTime() < new Date().setHours(0, 0, 0, 0);

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
    <SidePanel
      open={open}
      onOpenChange={(o) => { if (!o) close(); }}
      size="lg"
      title="New invoice"
      description="Bill services pay-as-you-go, as a package purchase or through an insurance provider."
    >
      <SidePanelBody className="space-y-5">

        <div className="grid gap-4 sm:grid-cols-6 *:min-w-0">
          <Field label="Patient" required className="sm:col-span-4">
            <PatientPicker value={patient} onChange={(p) => { setPatient(p); setEpisodeId(""); }} />
          </Field>
          <Field label="Arrangement" required className="sm:col-span-2">
            <Select value={arrangement} onValueChange={(v) => { setArrangement(v); setProviderId(""); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_ARRANGEMENTS.map((a) => <SelectItem key={a} value={a}>{labelize(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {episodes.length > 0 && (
            <Field label="Episode (optional)" className="sm:col-span-3">
              <Select value={episodeId} onValueChange={setEpisodeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="No episode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No episode</SelectItem>
                  {episodes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title || `Episode ${e.episodeNumber ?? ""}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {arrangement === "INSURANCE" && (
            <Field label="Insurance provider" className="sm:col-span-3">
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select provider…" /></SelectTrigger>
                <SelectContent>
                  {(providersQ.data?.items || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.code}){memberships.some((m) => m.providerId === p.id) ? " · member" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {arrangement === "INSURANCE" && patient ? (
            <InsuranceMembershipNote
              selectedMembership={selectedMembership}
              membershipExpired={membershipExpired}
              providerId={providerId}
              memberships={memberships}
            />
          ) : null}
        </div>

        <InvoiceLineItems
          items={items}
          services={services}
          onAdd={() => setItems((p) => [...p, emptyItem()])}
          onRemove={(key) => setItems((p) => p.filter((x) => x.key !== key))}
          onUpdate={updateItem}
        />

        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
          <Field label="Discount (₵)">
            <Input type="number" min={0} step="0.01" value={discountText} onChange={(e) => setDiscountText(e.target.value)} placeholder="0.00" />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes on this invoice" />
          </Field>
        </div>

        <InvoiceTotals arrangement={arrangement} subtotalCents={subtotalCents} discountCents={discountCents} coveredCents={coveredCents} totalCents={totalCents} patientDue={patientDue} />

        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}

      </SidePanelBody>

      <SidePanelFooter className="justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={issueNow} onCheckedChange={(v) => setIssueNow(!!v)} /> Issue now (else saved as draft)
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => close()}>Cancel</Button>
          <Button onClick={() => { setError(null); createM.mutate(); }} disabled={createM.isPending}>
            {createM.isPending ? "Saving…" : "Create invoice"}
          </Button>
        </div>
      </SidePanelFooter>
    </SidePanel>
  );
}
