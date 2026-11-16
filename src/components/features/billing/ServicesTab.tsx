"use client";
// ============ Services tab: catalogue management (price book) ============
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtomIcon } from "@/components/atoms/icon";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, fromCents } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import { inputToCents, type ListResponse, type ServiceLite } from "./billing-shared";

const ARRANGEMENT_LABELS: Record<string, string> = { PAYG: "PayG", PACKAGE: "Pkg", INSURANCE: "Ins" };

const NEW_CATEGORY = "__new_category__";

function ServiceDialog({
  open,
  initial,
  categories,
  onClose,
}: {
  open: boolean;
  initial: ServiceLite | null;
  categories: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => initial?.name || "");
  const [description, setDescription] = useState(() => initial?.description || "");
  const [category, setCategory] = useState(() => initial?.category || "TREATMENT");
  const [priceText, setPriceText] = useState(() => (initial ? String(fromCents(initial.standardPriceCents)) : ""));
  const [duration, setDuration] = useState(() => (initial ? String(initial.defaultDurationMin) : "30"));
  const [arrangements, setArrangements] = useState<string[]>(() => (initial?.arrangements?.length ? initial.arrangements : ["PAYG"]));
  const [active, setActive] = useState(() => (initial ? initial.active : true));
  const [error, setError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  // existing categories, plus the current value if it isn't in the list yet (e.g. editing an older service)
  const categoryOptions = Array.from(new Set([...categories, ...(category && !addingCategory ? [category] : [])])).sort();


  const saveM = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        standardPriceCents: inputToCents(priceText),
        defaultDurationMin: parseInt(duration, 10) || 30,
        arrangements,
        active,
      };
      if (initial) return apiFetch(`/api/services/${initial.id}`, { method: "PATCH", json: payload });
      return apiFetch("/api/services", { method: "POST", json: payload });
    },
    onSuccess: () => {
      toast.success(initial ? "Service updated" : "Service created");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit service" : "New service"}</DialogTitle>
          <DialogDescription>Services form the clinic price book used on invoices, packages and insurance rates.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Manual Therapy" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category *</Label>
            {addingCategory ? (
              <div className="relative">
                <Input
                  autoFocus
                  className="pr-9"
                  value={category}
                  onChange={(e) => setCategory(e.target.value.toUpperCase())}
                  placeholder="NEW CATEGORY NAME"
                />
                <button
                  type="button"
                  aria-label="Cancel — choose an existing category"
                  title="Choose an existing category"
                  onClick={() => { setAddingCategory(false); setCategory(""); setTimeout(() => setCategoryOpen(true), 0); }}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <AtomIcon name="X" className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Select
                open={categoryOpen}
                onOpenChange={setCategoryOpen}
                value={category || undefined}
                onValueChange={(v) => {
                  if (v === NEW_CATEGORY) { setAddingCategory(true); setCategory(""); }
                  else setCategory(v);
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a category…" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}
                  <SelectItem value={NEW_CATEGORY}>＋ New category…</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Standard price (₵) *</Label>
            <Input type="number" min={0} step="0.01" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Duration (min)</Label>
            <Input type="number" min={5} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Active</Label>
            <div className="flex h-10 items-center"><Switch checked={active} onCheckedChange={setActive} /></div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Payment arrangements</Label>
            <div className="flex flex-wrap gap-3">
              {PAYMENT_ARRANGEMENTS.map((a) => (
                <label key={a} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={arrangements.includes(a)}
                    onCheckedChange={(v) => setArrangements((prev) => (v ? [...prev, a] : prev.filter((x) => x !== a)))}
                  />
                  {labelize(a)}
                </label>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { setError(null); saveM.mutate(); }}
            disabled={saveM.isPending || !name.trim() || !category.trim() || inputToCents(priceText) <= 0 || arrangements.length === 0}
          >
            {saveM.isPending ? "Saving…" : initial ? "Save changes" : "Create service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicesTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.packagesManage) || hasPermission(user, PERMS.settingsManage);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceLite | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set("search", search.trim());
  if (category !== "all") params.set("category", category);

  const listQ = useQuery({
    queryKey: ["billing", "services", params.toString()],
    queryFn: () => apiFetch<ListResponse<ServiceLite> & { categories?: string[] }>(`/api/services?${params.toString()}`),
  });

  const allQ = useQuery({
    queryKey: ["billing", "services", "categories"],
    queryFn: () => apiFetch<ListResponse<ServiceLite> & { categories?: string[] }>("/api/services?pageSize=200"),
    staleTime: 60_000,
  });
  const categories = allQ.data?.categories || [];

  const toggleM = useMutation({
    mutationFn: (s: ServiceLite) => apiFetch(`/api/services/${s.id}`, { method: "PATCH", json: { active: !s.active } }),
    onSuccess: () => {
      toast.success("Service updated");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = listQ.data?.items || [];

  return (
    <div className="space-y-4">
      <div>
        <DataToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search services…" }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["billing", "services"] })}
          refreshing={listQ.isFetching}
          filters={
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger className="w-42.5"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          }
        >
          {canManage ? <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>New service</Button> : null}
        </DataToolbar>
      </div>

      <DataTable
        rows={rows}
        rowKey={(s: ServiceLite) => s.id}
        loading={listQ.isLoading}
        minWidth="min-w-160"
        onRowClick={canManage ? (s) => { setEditing(s); setDialogOpen(true); } : undefined}
        empty={<EmptyState icon="ClipboardList" title="No services found" description={search || category !== "all" ? "Try adjusting the filters." : "Add your first service to build the price book."} />}
        pagination={{ page, pageSize, total: listQ.data?.total || 0, onPageChange: setPage, onPageSizeChange: (size) => { setPageSize(size); setPage(1); } }}
        columns={[
          {
            id: "service", header: "Service",
            cell: (s) => (
              <>
                <p className="text-sm font-medium">{s.name}</p>
                {s.description ? <p className="max-w-80 truncate text-xs text-muted-foreground">{s.description}</p> : null}
              </>
            ),
          },
          { id: "category", header: "Category", cell: (s) => <Badge variant="outline">{labelize(s.category)}</Badge> },
          { id: "price", header: "Price", align: "right", cell: (s) => <span className="font-medium tabular-nums">{formatMoney(s.standardPriceCents)}</span> },
          { id: "duration", header: "Duration", align: "right", hideBelow: "md", cell: (s) => <span className="text-sm text-muted-foreground">{s.defaultDurationMin} min</span> },
          {
            id: "arrangements", header: "Arrangements",
            cell: (s) => (
              <div className="flex flex-wrap gap-1">
                {s.arrangements.map((a) => <Badge key={a} variant="outline" className="text-[10px]">{ARRANGEMENT_LABELS[a] || a}</Badge>)}
              </div>
            ),
          },
          {
            id: "active", header: "Active", align: "right",
            cell: (s) => (
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                {canManage ? <Switch checked={s.active} onCheckedChange={() => toggleM.mutate(s)} aria-label={`Toggle ${s.name}`} /> : <span className="text-sm">{s.active ? "Yes" : "No"}</span>}
              </div>
            ),
          },
        ]}
      />

      {dialogOpen && <ServiceDialog open initial={editing} categories={categories} onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
