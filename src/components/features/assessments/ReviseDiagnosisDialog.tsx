"use client";
// Revise-diagnosis dialog (creates an audited new version).
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DIAGNOSIS_CATEGORIES, SEVERITIES, SIDES, BODY_PARTS, labelize } from "@/lib/constants";
import * as API from "./assessments-api";
import { Field } from "./DiagnosisShared";

// ===================== revise dialog =====================
export function ReviseDiagnosisDialog({ item, onClose, onSaved }: {
  item: API.DiagnosisListItem | null; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [bodyPart, setBodyPart] = useState("");
  const [affectedSide, setAffectedSide] = useState("");
  const [severity, setSeverity] = useState("");
  const [explanation, setExplanation] = useState("");
  const [provisional, setProvisional] = useState(false);
  const [justification, setJustification] = useState("");

  // prefill whenever a new item is targeted
  const [lastId, setLastId] = useState<string | null>(null);
  if (item && item.id !== lastId) {
    setLastId(item.id);
    setTitle(item.title);
    setCategory(item.category);
    setBodyPart(item.bodyPart || "_none");
    setAffectedSide(item.affectedSide || "_none");
    setSeverity(item.severity || "_none");
    setExplanation(item.explanation || "");
    setProvisional(item.provisional);
    setJustification("");
  }

  const reviseQ = useMutation({
    mutationFn: () => API.updateDiagnosis(item!.id, {
      action: "revise",
      title: title.trim(),
      category,
      bodyPart: bodyPart === "_none" ? null : bodyPart,
      affectedSide: affectedSide === "_none" ? null : affectedSide,
      severity: severity === "_none" ? null : severity,
      explanation: explanation.trim() || null,
      provisional,
      justification: justification.trim(),
    }),
    onSuccess: (data) => {
      toast.success("Diagnosis revised", { description: `${item?.title} → ${data.title}. Previous record marked superseded.` });
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revise diagnosis"),
  });

  const submit = () => {
    if (title.trim().length < 2) return toast.error("Enter the revised diagnosis title");
    if (!category) return toast.error("Select a category");
    if (justification.trim().length < 3) return toast.error("A justification is required to revise a diagnosis");
    reviseQ.mutate();
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        {item ? (
          <>
            <DialogHeader>
              <DialogTitle>Revise diagnosis</DialogTitle>
              <DialogDescription>
                “{item.title}” will be marked <strong>superseded</strong> and a new active record created with these changes.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Diagnosis title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Category">
                  <Select value={category || undefined} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DIAGNOSIS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Body part">
                  <Select value={bodyPart || undefined} onValueChange={setBodyPart}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {[...BODY_PARTS].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Affected side">
                  <Select value={affectedSide || undefined} onValueChange={setAffectedSide}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {SIDES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Severity">
                  <Select value={severity || undefined} onValueChange={setSeverity}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Clinical explanation">
                <Textarea rows={3} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
              </Field>
              <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
                <div>
                  <Label className="text-sm">Provisional</Label>
                  <p className="text-xs text-muted-foreground">Pending confirmation</p>
                </div>
                <Switch checked={provisional} onCheckedChange={setProvisional} />
              </div>
              <Field label="Justification (required)" hint="Recorded in the diagnosis change history">
                <Textarea rows={3} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="e.g. MRI confirms L4-L5 left paracentral disc extrusion — refining diagnosis" />
              </Field>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={reviseQ.isPending} onClick={submit}>{reviseQ.isPending ? "Revising…" : "Create revised diagnosis"}</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
