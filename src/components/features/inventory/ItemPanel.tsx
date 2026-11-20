"use client";
// Side panel form: add / edit an inventory item.
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/molecules/field";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { INVENTORY_CATEGORIES, INVENTORY_UNITS, useCreateItem, useUpdateItem, type InventoryItem } from "./inventory-api";

interface Props {
  open: boolean;
  item: InventoryItem | null; // null = new item
  onClose: () => void;
}

export default function ItemPanel({ open, item, onClose }: Props) {
  return (
    <SidePanel open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={item ? "Edit item" : "New inventory item"} description={item ? item.sku || item.name : "Add a product or supply to track"}>
      {/* remount on item change so the form state resets */}
      {open ? <ItemForm key={item?.id ?? "new"} item={item} onClose={onClose} /> : null}
    </SidePanel>
  );
}

function ItemForm({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  const [category, setCategory] = useState(item?.category ?? INVENTORY_CATEGORIES[0]);
  const [unit, setUnit] = useState(item?.unit ?? INVENTORY_UNITS[0]);
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 0));
  const [reorderLevel, setReorderLevel] = useState(String(item?.reorderLevel ?? 5));
  const [cost, setCost] = useState(item ? String(item.unitCostCents / 100) : "");
  const [sell, setSell] = useState(item?.sellPriceCents ? String(item.sellPriceCents / 100) : "");
  const [supplier, setSupplier] = useState(item?.supplier ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const createM = useCreateItem();
  const updateM = useUpdateItem();
  const saving = createM.isPending || updateM.isPending;

  function save() {
    if (!name.trim()) return setError("Name is required");
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    const reorder = Math.max(0, Math.floor(Number(reorderLevel) || 0));
    const unitCostCents = Math.max(0, Math.round((Number(cost) || 0) * 100));
    const details = { name: name.trim(), sku: sku.trim(), category, unit, reorderLevel: reorder, unitCostCents, sellPriceCents: Math.max(0, Math.round((Number(sell) || 0) * 100)), supplier: supplier.trim(), location: location.trim(), notes: notes.trim() };
    const done = (msg: string) => ({ onSuccess: () => { toast.success(msg); onClose(); }, onError: (e: Error) => setError(e.message) });
    if (item) updateM.mutate({ id: item.id, data: details }, done("Item updated"));
    else createM.mutate({ ...details, quantity: qty }, done("Item added"));
  }

  return (
    <>
      <SidePanelBody className="space-y-4">
        <Field label="Item name" required error={error ?? undefined}>
          <Input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Ultrasound gel" />
        </Field>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="SKU / code">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="CON-001" />
          </Field>
          <Field label="Category">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{INVENTORY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="Unit">
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{INVENTORY_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Cost per unit">
            <Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Selling price per unit" hint="Used on the Sales page; leave empty to use the cost">
          <Input type="number" min={0} step="0.01" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="0.00" />
        </Field>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label={item ? "In stock" : "Opening quantity"} hint={item ? "Use Adjust stock to change this" : undefined}>
            <Input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!!item} />
          </Field>
          <Field label="Reorder level" hint="Flag as low at or below this">
            <Input type="number" min={0} value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="Supplier">
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Field>
          <Field label="Storage location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
      </SidePanelBody>
      <SidePanelFooter className="justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : item ? "Save changes" : "Add item"}</Button>
      </SidePanelFooter>
    </>
  );
}
