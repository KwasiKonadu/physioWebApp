"use client";
// New invoice builder (side panel): patient, episode, arrangement, line items, totals.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import { inputToCents, PatientPicker, type ListResponse, type InvoiceListItem, type ServiceLite, type ProviderLite, type PatientLite } from "./billing-shared";

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

  // insurance memberships already on the patient's record (captured at registration / profile)
  type Membership = {
    id: string; providerId: string; membershipNumber: string; policyNumber?: string | null;
    validFrom?: string | null; validTo?: string | null; principalMember?: string | null;
    relationshipToPrincipal?: string | null; status: string;
  };
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
          <div className="space-y-1.5 sm:col-span-4">
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={(p) => { setPatient(p); setEpisodeId(""); }} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Arrangement *</Label>
            <Select value={arrangement} onValueChange={(v) => { setArrangement(v); setProviderId(""); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_ARRANGEMENTS.map((a) => <SelectItem key={a} value={a}>{labelize(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {episodes.length > 0 && (
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Episode (optional)</Label>
              <Select value={episodeId} onValueChange={setEpisodeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="No episode" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No episode</SelectItem>
                  {episodes.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.title || `Episode ${e.episodeNumber ?? ""}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {arrangement === "INSURANCE" && (
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Insurance provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select provider…" /></SelectTrigger>
                <SelectContent>
                  {(providersQ.data?.items || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.code}){memberships.some((m) => m.providerId === p.id) ? " · member" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {arrangement === "INSURANCE" && patient ? (
            <div className="sm:col-span-6">
              {selectedMembership ? (
                <div className={`rounded-lg border px-3 py-2.5 text-sm ${membershipExpired || selectedMembership.status !== "ACTIVE" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50/60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Insurance membership on file</p>
                    {membershipExpired ? (
                      <span className="text-xs font-medium text-amber-700">Expired {formatDate(selectedMembership.validTo as string)} — check with the patient</span>
                    ) : selectedMembership.status !== "ACTIVE" ? (
                      <span className="text-xs font-medium text-amber-700">Membership is {labelize(selectedMembership.status)}</span>
                    ) : null}
                  </div>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
                    <div><dt className="text-muted-foreground">Membership no.</dt><dd className="font-mono text-sm font-semibold">{selectedMembership.membershipNumber}</dd></div>
                    <div><dt className="text-muted-foreground">Policy no.</dt><dd className="font-medium">{selectedMembership.policyNumber || "—"}</dd></div>
                    <div><dt className="text-muted-foreground">Valid until</dt><dd className="font-medium">{selectedMembership.validTo ? formatDate(selectedMembership.validTo) : "No end date"}</dd></div>
                    <div><dt className="text-muted-foreground">Principal member</dt><dd className="font-medium">{selectedMembership.principalMember ? `${selectedMembership.principalMember}${selectedMembership.relationshipToPrincipal ? ` (${labelize(selectedMembership.relationshipToPrincipal)})` : ""}` : "Self"}</dd></div>
                  </dl>
                </div>
              ) : providerId ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  This patient has no membership on file with the selected provider. Check the card, then add it on their profile.
                </p>
              ) : memberships.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  No insurance membership on file for this patient. Add one on their profile before billing insurance.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Choose a provider to see this patient&apos;s membership details.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line items *</Label>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
              Add line
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={it.key} className="space-y-3 rounded-lg border bg-muted/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line {idx + 1}</span>
                  <Button
                    type="button" variant="ghost" size="sm" aria-label="Remove line"
                    className="h-7 text-rose-600 hover:text-rose-700"
                    disabled={items.length === 1}
                    onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 *:min-w-0">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Service</Label>
                    <Select
                      value={it.serviceId || undefined}
                      onValueChange={(v) => updateItem(it.key, { serviceId: v === "custom" ? "" : v })}
                    >
                      <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Select a service…" /></SelectTrigger>
                      <SelectContent className="custom-scrollbar max-h-64">
                        <SelectItem value="custom">Custom item (type description)</SelectItem>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} · {formatMoney(s.standardPriceCents)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Description *</Label>
                    <Input
                      className="h-9"
                      placeholder="What is being billed"
                      value={it.description}
                      onChange={(e) => updateItem(it.key, { description: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 *:min-w-0">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Quantity</Label>
                    <Input
                      type="number" min={1} className="h-9"
                      value={String(it.quantity)}
                      onChange={(e) => updateItem(it.key, { quantity: Math.max(1, parseInt(e.target.value || "1", 10) || 1) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Unit price (₵)</Label>
                    <Input
                      type="number" min={0} step="0.01" className="h-9" disabled={!!it.ratePreview}
                      value={it.priceText}
                      onChange={(e) => updateItem(it.key, { priceText: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Line total</Label>
                    <div className="flex h-9 items-center justify-end rounded-md border bg-muted/40 px-3 text-sm font-medium tabular-nums">
                      {formatMoney(inputToCents(it.priceText) * it.quantity)}
                    </div>
                  </div>
                </div>

                {it.ratePreview ? (
                  <p className="text-xs text-sky-700">
                    Negotiated {formatMoney(it.ratePreview.rateCents)} · covers {it.ratePreview.coveragePercent}%
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
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
