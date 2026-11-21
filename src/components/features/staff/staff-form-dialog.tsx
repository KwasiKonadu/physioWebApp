"use client";
// FEATURE: Staff — add/edit form dialog (RHF + zod, therapist extras, remuneration, account creation)
import { useEffect, useMemo, useState } from "react";
import { get, useForm, useFieldArray, useWatch, type FieldPath, type PathValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { toCents, fromCents } from "@/lib/format";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { StaffFormTarget } from "./staff-form-model";
import { schema, FormValues } from "./staff-form-model";
import { StaffBasicsSection, StaffClinicalSection, StaffRemunerationSection, StaffAccountSection } from "./StaffFormSections";

export type { StaffFormTarget };

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
  const branchesQ = useQuery({
    queryKey: ["branches", "active"],
    queryFn: () => apiFetch<{ items: { id: string; name: string; active: boolean }[] }>("/api/branches"),
    enabled: open,
  });
  // active branches, plus the staff member's current one even if it has since been switched off
  const branchOptions = (branchesQ.data?.items || []).filter((b) => b.active || b.id === target?.branchId);

  const rolesQ = useQuery({
    queryKey: ["roles", "options"],
    queryFn: () => apiFetch<{ items: { id: string; name: string; system: boolean; isTherapist: boolean }[] }>("/api/roles?options=true"),
    enabled: open,
  });
  const roleOptions = rolesQ.data?.items || [];

  const defaults = useMemo<FormValues>(
    () => ({
      firstName: target?.firstName || "",
      lastName: target?.lastName || "",
      email: target?.email || "",
      phone: target?.phone || "",
      jobTitle: target?.jobTitle || "",
      department: target?.department || "",
      roleId: target?.roleId || "",
      isTherapistRole: false,
      employmentDate: target?.employmentDate ? new Date(target.employmentDate).toISOString().slice(0, 10) : "",
      employmentStatus: (target?.employmentStatus as FormValues["employmentStatus"]) || "ACTIVE",
      branchId: target?.branchId || "NONE",
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
  const { register, handleSubmit, setValue, reset, formState: { errors } } = form;

  const watchedValues = useWatch({ control: form.control });
  const watch = <P extends FieldPath<FormValues>>(name: P) =>
    get(watchedValues, name) as PathValue<FormValues, P>;

  const qualArray = useFieldArray({ control: form.control, name: "qualifications" });
  const availArray = useFieldArray({ control: form.control, name: "availability" });

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const roleId = watch("roleId");
  // new staff default to the Physiotherapist role once the role list has loaded
  useEffect(() => {
    if (!open || isEdit || roleId || roleOptions.length === 0) return;
    const physio = roleOptions.find((r) => r.isTherapist) || roleOptions[0];
    setValue("roleId", physio.id);
    setValue("isTherapistRole", physio.isTherapist);
  }, [open, isEdit, roleId, roleOptions, setValue]);
  // editing: derive the therapist flag from the loaded role list
  useEffect(() => {
    if (!open || !roleId || roleOptions.length === 0) return;
    setValue("isTherapistRole", !!roleOptions.find((r) => r.id === roleId)?.isTherapist);
  }, [open, roleId, roleOptions, setValue]);
  const remunerationMethod = watch("remunerationMethod");
  const createUser = watch("createUser");
  const isTherapist = !!roleOptions.find((r) => r.id === roleId)?.isTherapist;

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
        roleId: values.roleId,
        employmentDate: values.employmentDate || null,
        employmentStatus: values.employmentStatus,
        branchId: values.branchId === "NONE" ? null : values.branchId,
      };
      // pay applies to every staff member; only therapists can be paid per session / per patient, everyone else is salaried
      const method = isTherapist ? values.remunerationMethod : "FIXED";
      const rate = parseFloat(values.remunerationRate || "0");
      base.remunerationMethod = method;
      base.remunerationRateCents = rate > 0 ? toCents(rate) : null;
      if (isTherapist) {
        base.professionalDesignation = values.professionalDesignation || null;
        base.specialization = values.specialization || null;
        base.qualifications = values.qualifications.map((q) => q.value.trim()).filter(Boolean);
        base.availability = values.availability.map((a) => ({ day: a.day, start: a.start, end: a.end }));
      } else {
        base.qualifications = [];
        base.availability = [];
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
    <>
    <SidePanel
      open={open}
      onOpenChange={(v) => (!v ? onClose() : null)}
      size="lg"
      title={isEdit ? `Edit staff — ${target?.firstName} ${target?.lastName}` : "Add staff"}
      description={isEdit ? "Update profile, employment and remuneration details." : "Create a staff profile. Therapists get workload tracking and remuneration."}
    >
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SidePanelBody className="space-y-4">
          <StaffBasicsSection register={register} errors={errors} setValue={setValue} watch={watch} roleOptions={roleOptions} branchOptions={branchOptions} />

          <StaffClinicalSection register={register} setValue={setValue} watch={watch} qualArray={qualArray} availArray={availArray} isTherapist={isTherapist} />

          <Separator />
          <StaffRemunerationSection register={register} errors={errors} setValue={setValue} isTherapist={isTherapist} remunerationMethod={remunerationMethod} />

          <StaffAccountSection isEdit={isEdit} register={register} errors={errors} setValue={setValue} createUser={createUser} />

          </SidePanelBody>
          <SidePanelFooter className="justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add staff"}
            </Button>
          </SidePanelFooter>
        </form>

    </SidePanel>

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
    </>
  );
}
