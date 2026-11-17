"use client";
// Sign-off section: reason, date, signature and workflow buttons.

import { toast } from "sonner";
import { Controller } from "react-hook-form";
import { formatDate, formatMoney } from "@/lib/format";
import { DISCHARGE_REASONS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow } from "@/components/molecules/detail-row";
import { StatusBadge } from "@/components/atoms/status-badge";
import type { DischargeDetailResponse } from "../progress-reviews/types";
import type { UseFormReturn } from "react-hook-form";
import { DischargeFormValues } from "./discharge-form-model";
import { Field } from "@/components/molecules/field";

type Discharge = DischargeDetailResponse["discharge"];
type Baseline = DischargeDetailResponse["baseline"];

export function SignOffSection({ outstanding, form, discharge, editable, isCompleted, patch, complete, confirmOpen, setConfirmOpen, handleComplete }: { outstanding: Baseline["outstanding"]; form: UseFormReturn<DischargeFormValues>; discharge: Discharge; editable: boolean; isCompleted: boolean; patch: { isPending: boolean; mutate: (opts: { values: DischargeFormValues; action?: "submit" | "back_to_draft" }) => void }; complete: { isPending: boolean }; confirmOpen: boolean; setConfirmOpen: (v: boolean) => void; handleComplete: () => void }) {
  return (
    <>
    {/* Sign-off */}
    <section className="flex flex-1 flex-col">
      <SectionCard className="flex-1" title="Therapist sign-off" icon="Signature" description={isCompleted ? `Completed ${formatDate(discharge.completedAt)}` : "Workflow: save draft → submit for sign-off → complete (closes the episode)"}>
        {isCompleted ? (
          <div className="space-y-1">
            <DetailRow label="Signature" value={discharge.therapistSignature} />
            <DetailRow label="Completed at" value={formatDate(discharge.completedAt)} />
            <DetailRow label="Reason" value={<Badge variant="outline">{discharge.reason}</Badge>} />
            <DetailRow label="Episode status" value={<StatusBadge status={discharge.episode.status} />} />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
              <Field label="Discharge reason" htmlFor="reason">
                <Controller
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full"><SelectValue placeholder={discharge.reason || "Select a reason…"} /></SelectTrigger>
                      <SelectContent>
                        {DISCHARGE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Discharge date" htmlFor="dischargeDate">
                <Input id="dischargeDate" type="date" {...form.register("dischargeDate")} />
              </Field>
              <Field label="Therapist signature (required to complete)" htmlFor="therapistSignature" className="sm:col-span-2">
                <Input id="therapistSignature" placeholder="Type your full name to sign" {...form.register("therapistSignature")} />
              </Field>
            </div>
            {editable ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {discharge.status === "DRAFT" ? (
                  <>
                    <Button variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ values: form.getValues() })}>Save draft</Button>
                    <Button
                      variant="outline"
                      disabled={patch.isPending}
                      onClick={() => {
                        const values = form.getValues();
                        if (!values.reason) { toast.error("Select a discharge reason before submitting"); return; }
                        patch.mutate({ values, action: "submit" });
                      }}
                    >
                      Submit for sign-off
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" disabled={patch.isPending} onClick={() => patch.mutate({ values: form.getValues(), action: "back_to_draft" })}>Back to draft</Button>
                )}
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <Button onClick={() => setConfirmOpen(true)} disabled={complete.isPending}>Complete discharge</Button>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Complete this discharge?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will close the treatment episode ({discharge.episode.title}) and set the patient status to discharged. The record will be locked as final. Outstanding payments ({formatMoney(outstanding.outstandingCents)}) remain collectable and do not block this action.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleComplete} disabled={complete.isPending}>
                        {complete.isPending ? "Completing…" : "Complete discharge"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>
    </section>
    </>
  );
}
