"use client";
// Side panel form: record a sale of inventory items (deducts stock).
import { useState } from "react";
import { toast } from "sonner";
import { AtomIcon } from "@/components/atoms/icon";
import { Field } from "@/components/molecules/field";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import type { PatientLite } from "@/components/features/billing/billing-types";
import CustomerPicker from "./CustomerPicker";
import ItemPicker from "./ItemPicker";
import { PAYMENT_METHODS, useRecordSale, useSellableItems, type PaymentMethod } from "./inventory-api";

interface Line { key: number; itemId: string; quantity: string; price: string }

export default function NewSalePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <SidePanel open={open} onOpenChange={(o) => { if (!o) onClose(); }} title="New sale" description="Items sold are deducted from stock">
      {open ? <SaleForm onClose={onClose} /> : null}
    </SidePanel>
  );
}

let lineKey = 0;
const blank = (): Line => ({ key: ++lineKey, itemId: "", quantity: "1", price: "" });

function SaleForm({ onClose }: { onClose: () => void }) {
  const itemsQ = useSellableItems();
  const sellable = itemsQ.data ?? [];
  const items = sellable;
  const saleM = useRecordSale();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [error, setError] = useState<string | null>(null);

  const priceOf = (i: { sellPriceCents: number; unitCostCents: number }) => (i.sellPriceCents || i.unitCostCents) / 100;
  const patch = (key: number, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const total = lines.reduce((s, l) => s + Math.round((Number(l.price) || 0) * 100) * (Math.floor(Number(l.quantity)) || 0), 0);

  function save() {
    const chosen = lines.filter((l) => l.itemId);
    if (chosen.length === 0) return setError("Add at least one item");
    const built: { itemId: string; quantity: number; unitPriceCents: number }[] = [];
    for (const l of chosen) {
      const item = items.find((i) => i.id === l.itemId)!;
      const qty = Math.floor(Number(l.quantity));
      if (!(qty >= 1)) return setError(`Enter a quantity for ${item.name}`);
      if (qty > item.quantity) return setError(`Only ${item.quantity} ${item.unit} of ${item.name} in stock`);
      built.push({ itemId: item.id, quantity: qty, unitPriceCents: Math.max(0, Math.round((Number(l.price) || 0) * 100)) });
    }
    saleM.mutate(
      { patientId: patient?.id, paymentMethod: method, note: note.trim(), lines: built },
      { onSuccess: () => { toast.success("Sale recorded"); onClose(); }, onError: (e: Error) => setError(e.message) },
    );
  }

  return (
    <>
      <SidePanelBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="Customer / patient">
            <CustomerPicker value={patient} onChange={setPatient} />
          </Field>
          <Field label="Payment method">
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Items</p>
          {lines.map((l) => {
            const item = items.find((i) => i.id === l.itemId);
            return (
              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem_5rem_2rem] items-start gap-2">
                <ItemPicker
                  items={sellable}
                  value={l.itemId}
                  disabledIds={lines.filter((x) => x.key !== l.key).map((x) => x.itemId)}
                  onChange={(it) => { patch(l.key, { itemId: it.id, price: String(priceOf(it)) }); setError(null); }}
                />
                <Input type="number" min={1} max={item?.quantity} value={l.quantity} onChange={(e) => { patch(l.key, { quantity: e.target.value }); setError(null); }} aria-label="Quantity" className="min-w-0" />
                <Input type="number" min={0} step="0.01" value={l.price} onChange={(e) => patch(l.key, { price: e.target.value })} aria-label="Unit price" placeholder="Price" className="min-w-0" />
                <Button variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <AtomIcon name="X" className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}><AtomIcon name="Plus" className="mr-1 h-4 w-4" />Add item</Button>
          {itemsQ.isSuccess && sellable.length === 0 ? <p className="text-xs text-muted-foreground">No items in stock to sell.</p> : null}
        </div>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </SidePanelBody>
      <SidePanelFooter className="justify-between">
        <span className="text-sm">Total <span className="font-semibold tabular-nums">{formatMoney(total)}</span></span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saleM.isPending}>{saleM.isPending ? "Saving…" : "Record sale"}</Button>
        </div>
      </SidePanelFooter>
    </>
  );
}
