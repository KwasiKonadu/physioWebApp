"use client";
// Sections of the staff add / edit form.
import { type FieldPath, type PathValue } from "react-hook-form";
import { STAFF_ROLES, EMPLOYMENT_STATUSES, REMUNERATION_METHODS, labelize } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AtomIcon } from "@/components/atoms/icon";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { FieldErrors, UseFieldArrayReturn, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Field } from "./StaffFormField";
import { FormValues, DAYS } from "./staff-form-model";
import { PasswordInput } from "@/components/molecules/password-input";

type Watch = <P extends FieldPath<FormValues>>(name: P) => PathValue<FormValues, P>;

export function StaffBasicsSection({ register, errors, setValue, watch, staffRole, branchOptions }: { register: UseFormRegister<FormValues>; errors: FieldErrors<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch; staffRole: FormValues["staffRole"]; branchOptions: { id: string; name: string; active: boolean }[] }) {
  return (
    <>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 *:min-w-0">
      <Field label="First name" error={errors.firstName?.message}>
        <Input {...register("firstName")} placeholder="Ama" />
      </Field>
      <Field label="Last name" error={errors.lastName?.message}>
        <Input {...register("lastName")} placeholder="Boateng" />
      </Field>
      <Field label="Email">
        <Input type="email" {...register("email")} placeholder="name@gmrsphysio.com.gh" />
      </Field>
      <Field label="Phone">
        <Input {...register("phone")} placeholder="+233 …" />
      </Field>
      <Field label="Job title" error={errors.jobTitle?.message}>
        <Input {...register("jobTitle")} placeholder="Physiotherapist" />
      </Field>
      <Field label="Department">
        <Input {...register("department")} placeholder="Clinical" />
      </Field>
      <Field label="Staff role">
        <Select value={staffRole} onValueChange={(v) => setValue("staffRole", v as FormValues["staffRole"])}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{labelize(r)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Employment status">
        <Select value={watch("employmentStatus")} onValueChange={(v) => setValue("employmentStatus", v as FormValues["employmentStatus"])}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EMPLOYMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Employment date">
        <Input type="date" {...register("employmentDate")} />
      </Field>
      <Field label="Branch">
        <Select value={watch("branchId")} onValueChange={(v) => setValue("branchId", v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="No branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">— No branch —</SelectItem>
            {branchOptions.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}{b.active ? "" : " (inactive)"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
    </>
  );
}

export function StaffClinicalSection({ register, setValue, watch, qualArray, availArray, isTherapist }: { register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch; qualArray: UseFieldArrayReturn<FormValues, "qualifications">; availArray: UseFieldArrayReturn<FormValues, "availability">; isTherapist: boolean }) {
  return (
    <>
    {isTherapist && (
      <>
        <Separator />
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
            <AtomIcon name="Stethoscope" className="h-4 w-4 text-navy-800" />
            Clinical profile
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 *:min-w-0">
            <Field label="Professional designation">
              <Input {...register("professionalDesignation")} placeholder="BSc Physiotherapy" />
            </Field>
            <Field label="Specialization">
              <Input {...register("specialization")} placeholder="Musculoskeletal rehabilitation" />
            </Field>
          </div>

          {/* Qualifications builder */}
          <div className="mt-3">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Qualifications</Label>
            <div className="mt-2 space-y-2">
              {qualArray.fields.length === 0 && (
                <p className="text-xs text-muted-foreground">No qualifications added.</p>
              )}
              {qualArray.fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Input className="min-w-0 flex-1" {...register(`qualifications.${i}.value`)} placeholder="BSc Physiotherapy — University" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => qualArray.remove(i)} aria-label="Remove">
                    <AtomIcon name="X" className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => qualArray.append({ value: "" })}>
                <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add qualification
              </Button>
            </div>
          </div>

          {/* Availability builder */}
          <div className="mt-4">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Availability</Label>
            <div className="mt-2 space-y-2">
              {availArray.fields.length === 0 && (
                <p className="text-xs text-muted-foreground">No availability added.</p>
              )}
              {availArray.fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Select
                    value={watch(`availability.${i}.day`)}
                    onValueChange={(v) => setValue(`availability.${i}.day`, v)}
                  >
                    <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="time" {...register(`availability.${i}.start`)} className="min-w-0 flex-1" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="time" {...register(`availability.${i}.end`)} className="min-w-0 flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => availArray.remove(i)} aria-label="Remove">
                    <AtomIcon name="X" className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => availArray.append({ day: "Mon", start: "08:00", end: "17:00" })}>
                <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" /> Add availability slot
              </Button>
            </div>
          </div>
        </div>

      </>
    )}
    </>
  );
}

export function StaffRemunerationSection({ register, errors, setValue, isTherapist, remunerationMethod }: { register: UseFormRegister<FormValues>; errors: FieldErrors<FormValues>; setValue: UseFormSetValue<FormValues>; isTherapist: boolean; remunerationMethod: FormValues["remunerationMethod"] }) {
  return (
    <>
    <div>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
        <AtomIcon name="Wallet" className="h-4 w-4 text-navy-800" />
        Remuneration
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 *:min-w-0">
        {isTherapist ? (
          <Field label="Method">
            <Select value={remunerationMethod} onValueChange={(v) => setValue("remunerationMethod", v as FormValues["remunerationMethod"])}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REMUNERATION_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "FIXED" ? "Fixed monthly salary" : m === "PER_PATIENT" ? "Per unique patient" : "Per completed session"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field
          label={!isTherapist || remunerationMethod === "FIXED" ? "Monthly salary (GHS)" : "Rate (GHS)"}
          error={errors.remunerationRate?.message}
        >
          <Input
            type="number" step="0.01" min="0" {...register("remunerationRate")}
            placeholder={
              !isTherapist || remunerationMethod === "FIXED" ? "e.g. 2500.00 per month"
                : remunerationMethod === "PER_SESSION" ? "30.00 per session" : "150.00 per patient"
            }
          />
        </Field>
      </div>
    </div>
    </>
  );
}

export function StaffAccountSection({ isEdit, register, errors, setValue, createUser }: { isEdit: boolean; register: UseFormRegister<FormValues>; errors: FieldErrors<FormValues>; setValue: UseFormSetValue<FormValues>; createUser: boolean }) {
  return (
    <>
    {!isEdit && (
      <>
        <Separator />
        <div className="rounded-lg border bg-muted/40 p-3">
          <label className="flex items-start gap-3">
            <Checkbox
              checked={createUser}
              onCheckedChange={(v) => setValue("createUser", v === true)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium">Create login account</p>
              <p className="text-xs text-muted-foreground">
                Uses the email above with a system role mapped from the staff role.
              </p>
              {createUser && (
                <div className="mt-2 w-full max-w-xs">
                  <PasswordInput {...register("createPassword")} placeholder="Initial password (min 8 chars)" />
                  {errors.createPassword && (
                    <p className="mt-1 text-xs text-rose-600">{errors.createPassword.message}</p>
                  )}
                </div>
              )}
            </div>
          </label>
        </div>
      </>
    )}
    </>
  );
}
