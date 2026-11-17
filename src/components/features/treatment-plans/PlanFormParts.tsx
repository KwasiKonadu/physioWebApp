"use client";
// Small pieces shared by the plan form steps: intervention name input, row shell, error text.
import { useState } from "react";
import { type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { AtomIcon } from "@/components/atoms/icon";
import { PLAN_INTERVENTIONS } from "@/lib/constants";
import { CUSTOM_SENTINEL, FormValues } from "./plan-form-schema";

// ---------- intervention name: presets select + custom free text ----------
export function InterventionNameInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const isPreset = (PLAN_INTERVENTIONS as readonly string[]).includes(value || "");
  const [custom, setCustom] = useState(!!value && !isPreset);

  if (custom) {
    return (
      <div className="flex gap-1.5">
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Custom intervention name" />
        <Button
          type="button" variant="ghost" size="icon" className="shrink-0"
          onClick={() => { setCustom(false); onChange(""); }}
          title="Choose from presets instead"
        >
          <AtomIcon name="List" className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <Select value={value || ""} onValueChange={(v) => {
      if (v === CUSTOM_SENTINEL) { setCustom(true); onChange(""); } else onChange(v);
    }}>
      <SelectTrigger className="w-full"><SelectValue placeholder="Select intervention" /></SelectTrigger>
      <SelectContent>
        {PLAN_INTERVENTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
        <SelectItem value={CUSTOM_SENTINEL}>
          <span className="inline-flex items-center gap-1.5"><AtomIcon name="Pencil" className="h-3.5 w-3.5" /> Custom…</span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

// ---------- repeatable row helpers ----------
export function RowShell({ index, label, onRemove, children }: {
  index: number; label: string; onRemove: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label} {index + 1}</span>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600" onClick={onRemove} aria-label={`Remove ${label}`}>
          <AtomIcon name="Trash2" className="h-3.5 w-3.5" />
        </Button>
      </div>
      {children}
    </div>
  );
}

export function ErrText({ form, name }: { form: UseFormReturn<FormValues>; name: string }) {
  const err = name.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, form.formState.errors);
  const msg = (err as { message?: string } | undefined)?.message;
  return msg ? <p className="mt-1 text-xs text-rose-600">{msg}</p> : null;
}
