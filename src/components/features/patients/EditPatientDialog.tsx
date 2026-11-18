"use client";
// ============ Patient profile: edit demographics (PATCH /api/patients/[id]) ============
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { calcAge } from "@/lib/format";
import { GENDERS, MARITAL_STATUSES, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/molecules/field";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import type { PatientDto } from "./hooks";
import { EMAIL_RE } from "./registration-schema";

const schema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  middleName: z.string().max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  dateOfBirth: z.string(),
  gender: z.string(),
  maritalStatus: z.string(),
  phone: z.string().trim().min(1, "Phone is required").max(30),
  altPhone: z.string().max(30),
  email: z.string().max(160).refine((v) => v === "" || EMAIL_RE.test(v), "Invalid email address"),
  address: z.string().max(500),
  occupation: z.string().max(120),
  nationality: z.string().max(80),
  paymentArrangement: z.string().min(1),
});
type Values = z.infer<typeof schema>;

const toValues = (p: PatientDto): Values => ({
  firstName: p.firstName, middleName: p.middleName ?? "", lastName: p.lastName,
  dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : "",
  gender: p.gender ?? "", maritalStatus: p.maritalStatus ?? "",
  phone: p.phone, altPhone: p.altPhone ?? "", email: p.email ?? "",
  address: p.address ?? "", occupation: p.occupation ?? "", nationality: p.nationality ?? "",
  paymentArrangement: p.paymentArrangement,
});

export function EditPatientDialog({ open, onOpenChange, patient, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; patient: PatientDto; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(patient), mode: "onTouched" });
  const { register, control, handleSubmit, reset, formState: { errors, isDirty } } = form;

  const dob = useWatch({ control, name: "dateOfBirth" });

  // re-sync whenever the panel opens (or the record changes underneath)
  useEffect(() => { if (open) reset(toValues(patient)); }, [open, patient, reset]);

  const save = useMutation({
    mutationFn: (v: Values) =>
      apiFetch(`/api/patients/${patient.id}`, {
        method: "PATCH",
        json: {
          firstName: v.firstName.trim(), middleName: v.middleName.trim(), lastName: v.lastName.trim(),
          dateOfBirth: v.dateOfBirth, gender: v.gender, maritalStatus: v.maritalStatus,
          phone: v.phone.trim(), altPhone: v.altPhone.trim(), email: v.email.trim(),
          address: v.address.trim(), occupation: v.occupation.trim(), nationality: v.nationality.trim(),
          paymentArrangement: v.paymentArrangement,
        },
      }),
    onSuccess: () => {
      toast.success("Patient details updated");
      void qc.invalidateQueries({ queryKey: ["package-balance"] });
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Could not update patient", { description: e.message }),
  });

  const select = (name: "gender" | "maritalStatus" | "paymentArrangement", options: readonly string[], allowEmpty: boolean) => (
    <Controller control={control} name={name} render={({ field }) => (
      <Select value={field.value || (allowEmpty ? "__none__" : "")} onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
        <SelectContent>
          {allowEmpty ? <SelectItem value="__none__">Not specified</SelectItem> : null}
          {options.map((o) => <SelectItem key={o} value={o}>{labelize(o)}</SelectItem>)}
        </SelectContent>
      </Select>
    )} />
  );

  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => { if (!o && save.isPending) return; onOpenChange(o); }}
      size="xl"
      title={<><AtomIcon name="UserPen" className="h-4 w-4 text-teal-600" /> Edit patient</>}
      description={`${patient.patientCode} — update demographics and contact details. Emergency contacts and medical history are edited in their own tabs.`}
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="flex min-h-0 flex-1 flex-col">
        <SidePanelBody>
          <div className="grid gap-4 sm:grid-cols-3 *:min-w-0">
            <Field label="First name" required error={errors.firstName?.message}><Input {...register("firstName")} /></Field>
            <Field label="Middle name"><Input {...register("middleName")} /></Field>
            <Field label="Last name" required error={errors.lastName?.message}><Input {...register("lastName")} /></Field>
            <Field label="Date of birth">
              <div className="flex items-center gap-2">
                <Input type="date" {...register("dateOfBirth")} className="min-w-0 flex-1" />
                <div className="w-20 shrink-0"><Input value={calcAge(dob)} readOnly placeholder="—" aria-label="Age" className="bg-muted text-center" /></div>
              </div>
            </Field>
            <Field label="Gender">{select("gender", GENDERS, true)}</Field>
            <Field label="Marital status">{select("maritalStatus", MARITAL_STATUSES, true)}</Field>
            <Field label="Phone" required error={errors.phone?.message}><Input {...register("phone")} /></Field>
            <Field label="Alternative phone"><Input {...register("altPhone")} /></Field>
            <Field label="Email" error={errors.email?.message}><Input type="email" {...register("email")} /></Field>
            <Field label="Residential address" className="sm:col-span-2"><Input {...register("address")} /></Field>
            <Field label="Occupation"><Input {...register("occupation")} /></Field>
            <Field label="Nationality"><Input {...register("nationality")} /></Field>
            <Field label="Payment arrangement">{select("paymentArrangement", PAYMENT_ARRANGEMENTS, false)}</Field>
          </div>
        </SidePanelBody>
        <SidePanelFooter className="justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !isDirty}>
            {save.isPending ? <><AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> Saving…</> : <><AtomIcon name="Save" className="mr-1.5 h-4 w-4" /> Save changes</>}
          </Button>
        </SidePanelFooter>
      </form>
    </SidePanel>
  );
}
