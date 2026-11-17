"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataTable } from "@/components/molecules/data-table";
import { EmptyState } from "@/components/molecules/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { inputToCents, centsToInput, type ListResponse, type ServiceLite, type ProviderLite, type RateItem } from "./billing-shared";
import { Field } from "@/components/molecules/field";

// ---- Provider detail: negotiated rates ----
export function ProviderDetailDialog({
  providerId,
  open,
  onClose,
}: {
  providerId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rateOpen, setRateOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<RateItem | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [rateText, setRateText] = useState("");
  const [coverage, setCoverage] = useState("80");
  const [error, setError] = useState<string | null>(null);

  const providerQ = useQuery({
    queryKey: ["billing", "provider", providerId, "detail"],
    queryFn: () => apiFetch<{ provider: ProviderLite & { rates?: RateItem[] } }>(`/api/insurance/providers/${providerId}?rates=true`),
    enabled: open && !!providerId,
  });
  const servicesQ = useQuery({
    queryKey: ["billing", "services-active"],
    queryFn: () => apiFetch<ListResponse<ServiceLite>>("/api/services?active=true&pageSize=200"),
    enabled: open,
  });
  const provider = providerQ.data?.provider;
  const rates = provider?.rates || [];
  const services = servicesQ.data?.items || [];

  const openRateForm = (rate: RateItem | null) => {
    setEditingRate(rate);
    setServiceId(rate?.serviceId || "");
    setRateText(rate ? centsToInput(rate.rateCents) : "");
    setCoverage(rate ? String(rate.coveragePercent) : String(provider?.coveragePercent ?? 80));
    setError(null);
    setRateOpen(true);
  };

  const saveRateM = useMutation({
    mutationFn: () => {
      const selected = services.find((s) => s.id === serviceId);
      if (!selected) throw new Error("Select a service");
      return apiFetch(`/api/insurance/providers/${providerId}/rates`, {
        method: "POST",
        json: { serviceId, rateCents: inputToCents(rateText), coveragePercent: parseInt(coverage, 10) || 0 },
      });
    },
    onSuccess: () => {
      toast.success("Rate saved");
      qc.invalidateQueries({ queryKey: ["billing"] });
      setRateOpen(false);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{provider ? `${provider.name} (${provider.code})` : "Provider"}</DialogTitle>
            <DialogDescription>
              {provider ? `${labelize(provider.billingArrangement)} · default coverage ${provider.coveragePercent}%` : ""}
            </DialogDescription>
          </DialogHeader>
          {provider ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/40 p-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Contact</p><p className="font-medium">{provider.contactName || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{provider.contactPhone || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{provider.email || "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Claims</p><p className="font-medium">{provider._count?.claims ?? 0}</p></div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Negotiated rates ({rates.length})</p>
                <Button size="sm" onClick={() => openRateForm(null)}>Add / update rate</Button>
              </div>
              <DataTable
                bordered
                bare
                maxHeight="max-h-80"
                minWidth="min-w-120"
                rows={rates}
                rowKey={(r) => r.id}
                empty={<EmptyState icon="Percent" title="No rates configured" description="Add negotiated rates per service — invoices will fall back to standard prices otherwise." />}
                columns={[
                  { id: "service", header: "Service", cell: (r) => <span className="text-sm">{r.service?.name || r.serviceId}</span> },
                  { id: "standard", header: "Standard", align: "right", cell: (r) => <span className="tabular-nums text-muted-foreground">{formatMoney(r.service?.standardPriceCents)}</span> },
                  { id: "rate", header: "Negotiated", align: "right", cell: (r) => <span className="tabular-nums font-medium">{formatMoney(r.rateCents)}</span> },
                  { id: "cov", header: "Coverage", align: "right", cell: (r) => `${r.coveragePercent}%` },
                  { id: "edit", header: "", align: "right", cell: (r) => <Button size="sm" variant="ghost" onClick={() => openRateForm(r)}>Edit</Button> },
                ]}
              />
            </div>
          ) : (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={(o) => { if (!o) setRateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRate ? "Update rate" : "Add negotiated rate"}</DialogTitle>
            <DialogDescription>Stored per provider + service. Invoicing snapshots the applied rate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Service" required>
              <Select value={serviceId} onValueChange={(v) => {
                setServiceId(v);
                const svc = services.find((s) => s.id === v);
                if (svc && !editingRate) setRateText(String(svc.standardPriceCents / 100));
              }} disabled={!!editingRate}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select service…" /></SelectTrigger>
                <SelectContent className="custom-scrollbar max-h-64">
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · std {formatMoney(s.standardPriceCents)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rate (₵)" required>
                <Input type="number" min={0} step="0.01" value={rateText} onChange={(e) => setRateText(e.target.value)} />
              </Field>
              <Field label="Coverage (%)" required>
                <Input type="number" min={0} max={100} value={coverage} onChange={(e) => setCoverage(e.target.value)} />
              </Field>
            </div>
          </div>
          {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateOpen(false)}>Cancel</Button>
            <Button onClick={() => { setError(null); saveRateM.mutate(); }} disabled={saveRateM.isPending || !serviceId || inputToCents(rateText) <= 0}>
              {saveRateM.isPending ? "Saving…" : "Save rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

