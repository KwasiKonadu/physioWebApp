"use client";
// Editable session documentation form (vitals, interventions, complete / cancel).


import { useEffect, useRef, useState } from "react";

import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { PLAN_INTERVENTIONS } from "@/lib/constants";
import { setNavGuard } from "@/stores/app-store";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/molecules/section-card";


import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";


import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { CUSTOM, UNSET, SessionDetail, CompleteResponse, formSchema, FormValues, buildDefaults, payloadFrom } from "./session-form";

// ---- Editable documentation form (remounted per session via key) ----
export function SessionEditForm({ session, onBack, onReviewDue, aside, hasAside, leaveRef }: {
  session: SessionDetail;
  onBack: () => void;
  onReviewDue: () => void;
  aside: React.ReactNode;
  hasAside: boolean;
  leaveRef: React.MutableRefObject<((go: () => void) => boolean) | null>;
}) {
  const qc = useQueryClient();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [markAs, setMarkAs] = useState("CANCELLED");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(session),
    mode: "onSubmit",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "interventions" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["session", session.id] });
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<SessionDetail>(`/api/sessions/${session.id}`, { method: "PATCH", json: payload }),
    onSuccess: (_data, payload) => {
      const statusOnly = Object.keys(payload).length === 1 && "status" in payload;
      toast.success(statusOnly ? "Session started" : "Session saved");
      invalidate();
    },
    onError: (err: Error) => toast.error("Save failed", { description: err.message }),
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      apiFetch<CompleteResponse>(`/api/sessions/${session.id}/complete`, {
        method: "POST",
        json: payloadFrom(form.getValues()),
      }),
    onSuccess: (data) => {
      setCompleteOpen(false);
      toast.success(`Session completed. ${data.sessionsSinceReview}/${data.threshold} toward next review`);
      if (data.packageInfo?.deducted) {
        toast.info(`Package session deducted — ${data.packageInfo.remaining ?? 0} remaining`);
      }
      if (data.reviewDue) {
        onReviewDue();
        toast.warning("Progress review now due", {
          description: `${data.sessionsSinceReview} sessions since last review — threshold ${data.threshold} reached.`,
        });
      }
      invalidate();
    },
    onError: (err: Error) => {
      setCompleteOpen(false);
      toast.error("Could not complete session", { description: err.message });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch<SessionDetail>(`/api/sessions/${session.id}/cancel`, {
        method: "POST",
        json: { reason: cancelReason.trim() || undefined, markAs },
      }),
    onSuccess: () => {
      toast.success(markAs === "NO_SHOW" ? "Session marked as no-show" : "Session cancelled");
      setCancelOpen(false);
      setCancelReason("");
      invalidate();
      onBack();
    },
    onError: (err: Error) => toast.error("Could not cancel session", { description: err.message }),
  });

  const handleSave = form.handleSubmit(async (values) => {
    saveMutation.mutate(payloadFrom(values));
  });

  const handleStart = async () => {
    await form.handleSubmit(() => {
      saveMutation.mutate({ status: "IN_PROGRESS" });
    })();
  };

  const handleComplete = async () => {
    const ok = await form.trigger();
    if (!ok) {
      toast.error("Please check the highlighted fields before completing");
      return;
    }
    completeMutation.mutate();
  };

  const busy = saveMutation.isPending || completeMutation.isPending;

  // ---- unsaved-changes protection (breadcrumb, sidebar, tab close) ----
  const dirty = form.formState.isDirty;
  const finishLeave = () => {
    setLeaveOpen(false);
    setNavGuard(null);
    leaveRef.current = null;
    const go = pendingLeave.current;
    pendingLeave.current = null;
    if (go) go(); else onBack();
  };
  useEffect(() => {
    if (!dirty) return;
    leaveRef.current = (go) => { pendingLeave.current = go; setLeaveOpen(true); return true; };
    setNavGuard((proceed) => { pendingLeave.current = proceed; setLeaveOpen(true); return true; });
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => { leaveRef.current = null; setNavGuard(null); window.removeEventListener("beforeunload", h); };
  }, [dirty, leaveRef]);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr] *:min-w-0">
        <div className="flex min-w-0 flex-col gap-4">
      <SectionCard
        title="Interventions delivered"
        icon="Activity"
        description="Document the treatment actually delivered — do not simply copy the planned interventions."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => append({ preset: UNSET, customName: "", details: "" })}
          >
            <AtomIcon name="Plus" className="h-3.5 w-3.5" /> Add intervention
          </Button>
        }
      >
        <div className="space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">No interventions — add at least one before completing the session.</p>
          ) : null}
          {fields.map((f, index) => {
            return (
              <div key={f.id} className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center">
                <Controller
                  control={form.control}
                  name={`interventions.${index}.preset` as never}
                  render={({ field }) => (
                    <>
                      <div className="w-full sm:w-56">
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select intervention" /></SelectTrigger>
                          <SelectContent>
                            {PLAN_INTERVENTIONS.map((name) => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                            <SelectItem value={CUSTOM}>Custom…</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {field.value === CUSTOM ? (
                        <div className="w-full sm:w-56">
                          <Input
                            placeholder="Custom intervention name"
                            {...form.register(`interventions.${index}.customName` as never)}
                          />
                        </div>
                      ) : null}
                    </>
                  )}
                />
                <Input
                  className="flex-1"
                  placeholder="Details (dosage, sets, reps, area treated…)"
                  {...form.register(`interventions.${index}.details` as never)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => remove(index)}
                  aria-label="Remove intervention"
                >
                  <AtomIcon name="Trash2" className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Clinical record" icon="Stethoscope" className="flex-1">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-duration">Treatment duration (minutes)</Label>
              <Input id="doc-duration" type="number" min={1} max={600} placeholder="e.g. 45" {...form.register("durationMin")} />
              {form.formState.errors.durationMin ? (
                <p className="text-xs text-rose-600">{form.formState.errors.durationMin.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-sign">Therapist signature</Label>
              <Input id="doc-sign" placeholder="Type full name to sign" {...form.register("therapistSignature")} />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-response">Patient response</Label>
              <Textarea id="doc-response" rows={4} placeholder="How did the patient tolerate / respond to treatment?" {...form.register("patientResponse")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-obs">Clinical observations</Label>
              <Textarea id="doc-obs" rows={4} placeholder="Objective findings, ROM changes, compensations…" {...form.register("observations")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-notes">Additional notes</Label>
            <Textarea id="doc-notes" rows={2} placeholder="Anything else worth recording" {...form.register("notes")} />
          </div>
        </div>
      </SectionCard>

        </div>
        <div className="flex min-w-0 flex-col gap-4">
      <SectionCard title="Vitals" icon="HeartPulse" description="Recorded at the start of the session" className={hasAside ? "" : "flex-1"}>
        <div className="space-y-5">
          <Controller
            control={form.control}
            name="painLevel"
            render={({ field }) => (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Pain level (0–10)</Label>
                  <span className={cn("text-sm font-medium", field.value === null ? "text-muted-foreground" : "text-teal-700")}>
                    {field.value === null ? "Not recorded" : `${field.value}/10`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">0</span>
                  <Slider
                    value={[field.value ?? 5]}
                    min={0}
                    max={10}
                    step={1}
                    onValueChange={(v) => field.onChange(v[0])}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">10</span>
                </div>
              </div>
            )}
          />
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-bp">Blood pressure</Label>
              <Input id="doc-bp" placeholder="e.g. 120/80" {...form.register("bloodPressure")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-hr">Heart rate (bpm)</Label>
              <Input id="doc-hr" type="number" placeholder="e.g. 72" {...form.register("heartRate")} />
              {form.formState.errors.heartRate ? (
                <p className="text-xs text-rose-600">{form.formState.errors.heartRate.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-ov">Other vitals</Label>
              <Input id="doc-ov" placeholder="SpO₂, temperature, ROM…" {...form.register("otherVitals")} />
            </div>
          </div>
        </div>
      </SectionCard>

          {hasAside ? <div className="flex flex-1 flex-col *:flex-1">{aside}</div> : null}
        </div>
      </div>

      {/* ---- Action bar ---- */}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
        <Button variant="outline" onClick={handleSave} disabled={busy}>
          <AtomIcon name={saveMutation.isPending ? "Loader2" : "Save"} className={cn("h-4 w-4", saveMutation.isPending && "animate-spin")} />
          Save draft
        </Button>
        {session.status === "PLANNED" ? (
          <Button variant="outline" onClick={handleStart} disabled={busy}>
            <AtomIcon name="Play" className="h-4 w-4" /> Start session
          </Button>
        ) : null}

        <span className="grow" />

        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              <AtomIcon name="XCircle" className="h-4 w-4" /> Cancel / no-show
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
              <AlertDialogDescription>
                Cancelled and no-show sessions never count toward progress review and never deduct package sessions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Mark as</Label>
                <Select value={markAs} onValueChange={setMarkAs}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                    <SelectItem value="NO_SHOW">No-show</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">Reason</Label>
                <Textarea
                  id="cancel-reason"
                  rows={2}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Patient called in sick, therapist unavailable…"
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep session</AlertDialogCancel>
              <AlertDialogAction
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={(e) => { e.preventDefault(); cancelMutation.mutate(); }}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? <AtomIcon name="Loader2" className="h-4 w-4 animate-spin" /> : null}
                Confirm {markAs === "NO_SHOW" ? "no-show" : "cancellation"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
          <AlertDialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700" disabled={busy}>
              <AtomIcon name={completeMutation.isPending ? "Loader2" : "CheckCircle2"} className={cn("h-4 w-4", completeMutation.isPending && "animate-spin")} />
              Complete session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Complete this session?</AlertDialogTitle>
              <AlertDialogDescription>
                Completing is final: the session is locked for editing, counts toward the episode&apos;s progress-review
                threshold{session.patient.paymentArrangement === "PACKAGE" ? ", and deducts one session from the patient's active package" : ""}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                className="bg-teal-600 text-white hover:bg-teal-700"
                onClick={(e) => { e.preventDefault(); handleComplete(); }}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? <AtomIcon name="Loader2" className="h-4 w-4 animate-spin" /> : null}
                Complete session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Dialog open={leaveOpen} onOpenChange={(v) => { setLeaveOpen(v); if (!v) pendingLeave.current = null; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this session?</DialogTitle>
            <DialogDescription>You have unsaved documentation. Save a draft to keep it, or leave and discard it.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={finishLeave}>Discard &amp; leave</Button>
            <Button disabled={busy} onClick={() => form.handleSubmit((values) => saveMutation.mutate(payloadFrom(values), { onSuccess: finishLeave }))()}>
              {saveMutation.isPending ? "Saving…" : "Save draft & leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
