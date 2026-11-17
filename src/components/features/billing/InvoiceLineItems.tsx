"use client";
// Line-item rows of the new-invoice builder.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { inputToCents, type ServiceLite } from "./billing-shared";
import { DraftItem } from "./invoice-draft";
import { Field } from "@/components/molecules/field";

export function InvoiceLineItems({ items, services, onAdd, onRemove, onUpdate }: {
  items: DraftItem[];
  services: ServiceLite[];
  onAdd: () => void;
  onRemove: (key: number) => void;
  onUpdate: (key: number, patch: Partial<DraftItem>) => void;
}) {
  return (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <Label>Line items *</Label>
      <Button type="button" variant="outline" size="sm" onClick={() => onAdd()}>
        Add line
      </Button>
    </div>
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={it.key} className="space-y-3 rounded-lg border bg-muted/10 p-3">
          <div className="flex items-center justify-between">
            <span className="label-caps">Line {idx + 1}</span>
            <Button
              type="button" variant="ghost" size="sm" aria-label="Remove line"
              className="h-7 text-rose-600 hover:text-rose-700"
              disabled={items.length === 1}
              onClick={() => onRemove(it.key)}
            >
              Remove
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 *:min-w-0">
            <Field label="Service">
              <Select
                value={it.serviceId || undefined}
                onValueChange={(v) => onUpdate(it.key, { serviceId: v === "custom" ? "" : v })}
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
            </Field>
            <Field label="Description" required>
              <Input
                className="h-9"
                placeholder="What is being billed"
                value={it.description}
                onChange={(e) => onUpdate(it.key, { description: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3 *:min-w-0">
            <Field label="Quantity">
              <Input
                type="number" min={1} className="h-9"
                value={String(it.quantity)}
                onChange={(e) => onUpdate(it.key, { quantity: Math.max(1, parseInt(e.target.value || "1", 10) || 1) })}
              />
            </Field>
            <Field label="Unit price (₵)">
              <Input
                type="number" min={0} step="0.01" className="h-9" disabled={!!it.ratePreview}
                value={it.priceText}
                onChange={(e) => onUpdate(it.key, { priceText: e.target.value })}
              />
            </Field>
            <Field label="Line total">
              <div className="flex h-9 items-center justify-end rounded-md border bg-muted/40 px-3 text-sm font-medium tabular-nums">
                {formatMoney(inputToCents(it.priceText) * it.quantity)}
              </div>
            </Field>
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
  );
}
