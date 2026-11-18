"use client";
// Vitals for one phase of a session (START or END): pain slider + "pick a vital, enter value, Add" list.

import { useState } from "react";
import { Controller, type Control, type UseFormReturn } from "react-hook-form";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { FormValues, OTHER_VITAL, VITAL_TYPES, VitalPhase } from "./session-form";

export function SessionVitalsEditor({ form, phase }: { form: UseFormReturn<FormValues>; phase: VitalPhase }) {
  const painField = phase === "START" ? "painLevel" : "painLevelEnd";
  const [type, setType] = useState<string>(VITAL_TYPES[0].name);
  const [custom, setCustom] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");

  const preset = VITAL_TYPES.find((t) => t.name === type);
  const isOther = type === OTHER_VITAL;
  const all = form.watch("vitals");
  const mine = all.map((v, index) => ({ v, index })).filter((x) => x.v.phase === phase);
  const name = isOther ? custom.trim() : type;
  const canAdd = name.length > 0 && value.trim().length > 0;

  const add = () => {
    if (!canAdd) return;
    form.setValue("vitals", [...all, { phase, name, value: value.trim(), unit: (isOther ? unit.trim() : preset?.unit) || null }], { shouldDirty: true });
    setValue(""); setCustom(""); setUnit("");
  };
  const remove = (index: number) => form.setValue("vitals", all.filter((_, i) => i !== index), { shouldDirty: true });

  return (
    <div className="space-y-4">
      <Controller
        control={form.control as Control<FormValues>}
        name={painField}
        render={({ field }) => (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Pain level (0–10)</Label>
              <span className="flex items-center gap-2">
                <span className={cn("text-sm font-medium", field.value === null ? "text-muted-foreground" : "text-teal-700")}>
                  {field.value === null ? "Not recorded" : `${field.value}/10`}
                </span>
                {field.value !== null ? (
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => field.onChange(null)}>clear</button>
                ) : null}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">0</span>
              <Slider value={[field.value ?? 5]} min={0} max={10} step={1} onValueChange={(v) => field.onChange(v[0])} className="flex-1" />
              <span className="text-xs text-muted-foreground">10</span>
            </div>
          </div>
        )}
      />

      <div className="space-y-2">
        <Label>Add a vital</Label>
        <div className="flex flex-wrap gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VITAL_TYPES.map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}
              <SelectItem value={OTHER_VITAL}>Other…</SelectItem>
            </SelectContent>
          </Select>
          {isOther ? <Input className="w-36" placeholder="Name" value={custom} onChange={(e) => setCustom(e.target.value)} /> : null}
          <Input
            className="min-w-24 flex-1"
            placeholder={preset?.hint ?? "Value"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          {isOther ? <Input className="w-24" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} /> : (
            <span className="flex items-center text-xs text-muted-foreground">{preset?.unit}</span>
          )}
          <Button type="button" variant="outline" onClick={add} disabled={!canAdd}>
            <AtomIcon name="Plus" className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {mine.length ? (
        <ul className="divide-y rounded-lg border">
          {mine.map(({ v, index }) => (
            <li key={index} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-muted-foreground">{v.name}</span>
              <span className="flex items-center gap-2">
                <span className="font-medium">{v.value}{v.unit ? ` ${v.unit}` : ""}</span>
                <button type="button" aria-label={`Remove ${v.name}`} onClick={() => remove(index)} className="text-muted-foreground hover:text-rose-600">
                  <AtomIcon name="X" className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted-foreground">No vitals added yet.</p>}
    </div>
  );
}
