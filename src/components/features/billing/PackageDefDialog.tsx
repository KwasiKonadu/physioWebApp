"use client";
// Package definition add/edit dialog.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";







import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { fromCents } from "@/lib/format";
import { inputToCents, type ListResponse, type PackageDef, type ServiceLite } from "./billing-shared";

// ---- Create / edit package definition ----
export function PackageDefDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial: PackageDef | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => initial?.name || "");
  const [description, setDescription] = useState(() => initial?.description || "");
  const [sessions, setSessions] = useState(() => (initial ? String(initial.sessions) : "10"));
  const [priceText, setPriceText] = useState(() => (initial ? String(fromCents(initial.priceCents)) : ""));
  const [validityDays, setValidityDays] = useState(() => (initial ? String(initial.validityDays) : "90"));
  const [serviceIds, setServiceIds] = useState<string[]>(() => initial?.serviceIds || []);
  const [active, setActive] = useState(() => (initial ? initial.active : true));
  const [error, setError] = useState<string | null>(null);

  const servicesQ = useQuery({
    queryKey: ["billing", "services-active"],
    queryFn: () => apiFetch<ListResponse<ServiceLite>>("/api/services?active=true&pageSize=200"),
    enabled: true,
  });

  const saveM = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        sessions: parseInt(sessions, 10) || 0,
        priceCents: inputToCents(priceText),
        validityDays: parseInt(validityDays, 10) || 0,
        serviceIds,
        active,
      };
      if (initial) return apiFetch(`/api/packages/${initial.id}`, { method: "PATCH", json: payload });
      return apiFetch("/api/packages", { method: "POST", json: payload });
    },
    onSuccess: () => {
      toast.success(initial ? "Package updated" : "Package created");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit package" : "New package"}</DialogTitle>
          <DialogDescription>Predefined session bundles sold to patients at a package price.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Back Relief Pack" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sessions *</Label>
            <Input type="number" min={1} value={sessions} onChange={(e) => setSessions(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Price (₵) *</Label>
            <Input type="number" min={0} step="0.01" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Validity (days) *</Label>
            <Input type="number" min={1} value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive packages cannot be sold</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Included services</Label>
            <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto custom-scrollbar rounded-lg border p-2.5 sm:grid-cols-2">
              {(servicesQ.data?.items || []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={(v) => setServiceIds((prev) => (v ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
              {servicesQ.isLoading && <Skeleton className="h-16 w-full" />}
            </div>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { setError(null); saveM.mutate(); }}
            disabled={saveM.isPending || !name.trim() || inputToCents(priceText) <= 0 || (parseInt(sessions, 10) || 0) < 1}
          >
            {saveM.isPending ? "Saving…" : initial ? "Save changes" : "Create package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
