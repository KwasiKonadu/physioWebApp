"use client";
// Side panel form: record stock coming in, going out, or a count correction.
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/molecules/field";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdjustStock, type InventoryItem, type MovementType } from "./inventory-api";

const TYPE_LABEL: Record<MovementType, string> = { IN: "Stock in (received)", OUT: "Stock out (used / issued)", ADJUST: "Set count (stocktake)" };

export default function AdjustPanel({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  return (
    <SidePanel open={!!item} onOpenChange={(o) => { if (!o) onClose(); }} title="Adjust stock" description={item ? `${item.name} · ${item.quantity} ${item.unit} on hand` : undefined} size="sm">
      {item ? <AdjustForm key={item.id} item={item} onClose={onClose} /> : null}
    </SidePanel>
  );
}

function AdjustForm({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [type, setType] = useState<MovementType>("IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const adjustM = useAdjustStock();

  const n = Math.floor(Number(amount));
  const preview = !Number.isFinite(n) || amount === "" ? null : type === "ADJUST" ? n : type === "IN" ? item.quantity + n : Math.max(0, item.quantity - n);

  function save() {
    if (!Number.isFinite(n) || amount === "" || n < (type === "ADJUST" ? 0 : 1)) return setError(type === "ADJUST" ? "Enter the counted quantity" : "Enter a quantity greater than 0");
    if (type === "OUT" && n > item.quantity) return setError(`Only ${item.quantity} ${item.unit} in stock`);
    adjustM.mutate(
      { id: item.id, type, amount: n, reason: reason.trim() || TYPE_LABEL[type] },
      { onSuccess: () => { toast.success("Stock updated"); onClose(); }, onError: (e: Error) => setError(e.message) },
    );
  }

  return (
    <>
      <SidePanelBody className="space-y-4">
        <Field label="Movement type">
          <Select value={type} onValueChange={(v) => { setType(v as MovementType); setError(null); }}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(TYPE_LABEL) as MovementType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={type === "ADJUST" ? "Counted quantity" : "Quantity"} required error={error ?? undefined} hint={preview !== null && !error ? `New balance: ${preview} ${item.unit}` : undefined}>
          <Input type="number" min={0} value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} />
        </Field>
        <Field label="Reason / reference">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Delivery note #123, used in session" />
        </Field>
      </SidePanelBody>
      <SidePanelFooter className="justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={adjustM.isPending}>{adjustM.isPending ? "Saving…" : "Save"}</Button>
      </SidePanelFooter>
    </>
  );
}
