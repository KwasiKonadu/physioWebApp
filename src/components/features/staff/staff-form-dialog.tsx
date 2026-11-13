"use client";
// FEATURE: Staff — add/edit form dialog (RHF + zod, therapist extras, remuneration, account creation)
import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { STAFF_ROLES, EMPLOYMENT_STATUSES, REMUNERATION_METHODS, labelize } from "@/lib/constants";
import { toCents, fromCents } from "@/lib/format";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AtomIcon } from "@/components/atoms/icon";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface StaffFormTarget {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string;
  department: string | null;
  staffRole: string;
  employmentDate: string | null;
  employmentStatus: string;
  professionalDesignation: string | null;
  specialization: string | null;
  qualifications: string[];
  availability: { day: string; start?: string; end?: string }[];
  remunerationMethod: string;
  remunerationRateCents: number | null;
}

const schema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.union([z.string().email("Invalid email"), z.literal("")]),
    phone: z.string(),
    jobTitle: z.string().min(1, "Job title is required"),
    department: z.string(),
    staffRole: z.enum(STAFF_ROLES),
    employmentDate: z.string(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES),
    professionalDesignation: z.string(),
    specialization: z.string(),
    qualifications: z.array(z.object({ value: z.string().min(1, "Empty qualification") })),
    availability: z.array(
      z.object({
        day: z.string().min(1),
        start: z.string(),
        end: z.string(),
      })
    ),
    remunerationMethod: z.enum(REMUNERATION_METHODS),
    remunerationRate: z.string(),
    createUser: z.boolean(),
    createPassword: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.createUser && (!v.createPassword || v.createPassword.length < 8)) {
      ctx.addIssue({ code: "custom", path: ["createPassword"], message: "Password must be at least 8 characters" });
    }
    if (v.staffRole === "PHYSIOTHERAPIST" && v.remunerationMethod !== "FIXED") {
      const rate = parseFloat(v.remunerationRate);
      if (!rate || rate <= 0) {
        ctx.addIssue({ code: "custom", path: ["remunerationRate"], message: "Rate is required for this method" });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  open: boolean;
  target?: StaffFormTarget | null; // null → create new
  onClose: () => void;
}

export default function StaffFormDialog({ open, target, onClose }: Props) {
  const isEdit = !!target;
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const defaults = useMemo<FormValues>(
    () => ({
      firstName: target?.firstName || "",
      lastName: target?.lastName || "",
      email: target?.email || "",
      phone: target?.phone || "",
      jobTitle: target?.jobTitle || "",
      department: target?.department || "",
      staffRole: (target?.staffRole as FormValues["staffRole"]) || "PHYSIOTHERAPIST",
      employmentDate: target?.employmentDate ? new Date(target.employmentDate).toISOString().slice(0, 10) : "",
      employmentStatus: (target?.employmentStatus as FormValues["employmentStatus"]) || "ACTIVE",
      professionalDesignation: target?.professionalDesignation || "",
      specialization: target?.specialization || "",
      qualifications: (target?.qualifications || []).map((q) => ({ value: q })),
      availability: (target?.availability || []).map((a) => ({ day: a.day, start: a.start || "08:00", end: a.end || "17:00" })),
      remunerationMethod: (target?.remunerationMethod as FormValues["remunerationMethod"]) || "FIXED",
      remunerationRate: target?.remunerationRateCents ? String(fromCents(target.remunerationRateCents)) : "",
      createUser: false,
      createPassword: "",
    }),
    [target, open]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = form;

  const qualArray = useFieldArray({ control: form.control, name: "qualifications" });
  const availArray = useFieldArray({ control: form.control, name: "availability" });

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const staffRole = watch("staffRole");
  const remunerationMethod = watch("remunerationMethod");
  const createUser = watch("createUser");
  const isTherapist = staffRole === "PHYSIOTHERAPIST";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // validate first; only open the confirm dialog when the form is valid
    form.trigger().then((ok) => {
      if (ok) setConfirmOpen(true);
    });
  };

  const doSave = handleSubmit(async (values) => {
    setSaving(true);
    try {
      const base: Record<string, unknown> = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email || null,
        phone: values.phone || null,
        jobTitle: values.jobTitle,
        department: values.department || null,
        staffRole: values.staffRole,
        employmentDate: values.employmentDate || null,
        employmentStatus: values.employmentStatus,
      };
      if (isTherapist) {
        base.professionalDesignation = values.professionalDesignation || null;
        base.specialization = values.specialization || null;
        base.qualifications = values.qualifications.map((q) => q.value.trim()).filter(Boolean);
        base.availability = values.availability.map((a) => ({ day: a.day, start: a.start, end: a.end }));
        base.remunerationMethod = values.remunerationMethod;
        base.remunerationRateCents = values.remunerationMethod === "FIXED" ? null : toCents(parseFloat(values.remunerationRate || "0"));
      } else {
        base.qualifications = [];
        base.availability = [];
        base.remunerationMethod = "FIXED";
        base.remunerationRateCents = null;
      }

      if (isEdit && target) {
        await apiFetch(`/api/staff/${target.id}`, { method: "PATCH", json: base });
        toast.success("Staff profile updated");
      } else {
        if (values.createUser) {
          base.createUser = true;
          base.createPassword = values.createPassword;
        }
        await apiFetch("/api/staff", { method: "POST", json: base });
        toast.success("Staff member added");
      }
      await qc.invalidateQueries({ queryKey: ["staff"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save staff");
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit staff — ${target?.firstName} ${target?.lastName}` : "Add staff"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update profile, employment and remuneration details." : "Create a staff profile. Therapists get workload tracking and remuneration."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{labelize(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Employment status">
              <Select value={watch("employmentStatus")} onValueChange={(v) => setValue("employmentStatus", v as FormValues["employmentStatus"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
          </div>

          {isTherapist && (
            <>
              <Separator />
              <div>
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
                  <AtomIcon name="Stethoscope" className="h-4 w-4 text-teal-600" />
                  Clinical profile
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                        <Input {...register(`qualifications.${i}.value`)} placeholder="BSc Physiotherapy — University" />
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
                          value={form.watch(`availability.${i}.day`)}
                          onValueChange={(v) => setValue(`availability.${i}.day`, v)}
                        >
                          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DAYS.map((d) => (
                              <SelectItem key={d} value={d}>{d}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="time" {...register(`availability.${i}.start`)} className="w-32" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="time" {...register(`availability.${i}.end`)} className="w-32" />
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

              <Separator />
              <div>
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-800">
                  <AtomIcon name="Wallet" className="h-4 w-4 text-teal-600" />
                  Remuneration
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Method">
                    <Select value={remunerationMethod} onValueChange={(v) => setValue("remunerationMethod", v as FormValues["remunerationMethod"])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REMUNERATION_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m === "FIXED" ? "Fixed salary" : m === "PER_PATIENT" ? "Per unique patient" : "Per completed session"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {remunerationMethod !== "FIXED" && (
                    <Field label="Rate (GHS)" error={errors.remunerationRate?.message}>
                      <Input type="number" step="0.01" min="0" {...register("remunerationRate")}
                        placeholder={remunerationMethod === "PER_SESSION" ? "30.00 per session" : "150.00 per patient"} />
                    </Field>
                  )}
                </div>
              </div>
            </>
          )}

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
                        <Input type="password" {...register("createPassword")} placeholder="Initial password (min 8 chars)" />
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

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-navy-800 hover:bg-navy-900">
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add staff"}
            </Button>
          </DialogFooter>
        </form>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isEdit ? "Save staff changes?" : "Create staff member?"}</AlertDialogTitle>
              <AlertDialogDescription>
                {isEdit
                  ? "Changes to the profile, employment status or remuneration are recorded in the audit log."
                  : "A staff code is generated automatically. This action is recorded in the audit log."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void doSave()} disabled={saving}>
                {saving ? "Saving…" : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
