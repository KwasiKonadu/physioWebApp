"use client";
// ============ Patient registration: 5-step wizard with duplicate detection ============
import { useMemo, useState } from "react";
import { get, useFieldArray, useForm, useWatch, type FieldPath, type PathValue } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ymd } from "@/lib/format";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { SidePanel, SidePanelBody, SidePanelFooter } from "@/components/molecules/side-panel";
import { useDuplicates, useDebounced, useInsuranceProviders } from "./hooks";
import { ageFromDob, formSchema, FormValues, STEPS, STEP_FIELDS, EMPTY_CONTACT } from "./registration-schema";
import { RegistrationStepper } from "./RegistrationStepper";
import { PersonalStep, ContactsStep, HistoryStep, ReferralStep, ConsentStep } from "./RegistrationSteps";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: (patientId: string) => void;
}

export default function PatientRegistrationDialog({ open, onOpenChange, onRegistered }: Props) {
  const queryClient = useQueryClient();
  const providers = useInsuranceProviders();
  const [step, setStep] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: "", middleName: "", lastName: "", dateOfBirth: "", gender: "",
      phone: "", altPhone: "", email: "", address: "", occupation: "",
      maritalStatus: "", nationality: "Ghanaian",
      emergencyContacts: [{ ...EMPTY_CONTACT }],
      medicalHistory: [],
      referral: { source: "", referrerName: "", referrerContact: "", referralDate: "", notes: "" },
      paymentArrangement: "PAYG",
      insurance: { providerId: "", membershipNumber: "", policyNumber: "", validFrom: "", validTo: "", principalMember: "", relationshipToPrincipal: "" },
      consent: { treatmentConsent: false, dataConsent: false, signatureName: "", consentDate: ymd(new Date()), guardianName: "", guardianRelationship: "" },
    },
    mode: "onTouched",
  });

  const { register, setValue, trigger, handleSubmit, formState } = form;
  const watchedValues = useWatch({ control: form.control });
  const watch = <P extends FieldPath<FormValues>>(name: P) =>
    get(watchedValues, name) as PathValue<FormValues, P>;
  const contacts = useFieldArray({ control: form.control, name: "emergencyContacts" });
  const history = useFieldArray({ control: form.control, name: "medicalHistory" });

  // ---- duplicate detection (step 1) ----
  const phone = watch("phone");
  const firstName = watch("firstName");
  const lastName = watch("lastName");
  const dob = watch("dateOfBirth");
  const dupKey = `${phone}|${firstName}|${lastName}|${dob}`;
  const debouncedDupKey = useDebounced(dupKey, 400);
  const dupParams = useMemo(() => {
    const [p, f, l, d] = debouncedDupKey.split("|");
    return { phone: p || "", firstName: f || "", lastName: l || "", dob: d || "" };
  }, [debouncedDupKey]);
  const dupEnabled = !!(dupParams.phone.trim().length >= 7 || (dupParams.firstName.trim() && dupParams.lastName.trim()));
  const duplicates = useDuplicates(dupParams, dupEnabled);
  const dupMatches = dupEnabled && !duplicates.isLoading ? (duplicates.data?.items ?? []) : [];
  const isMinor = (ageFromDob(dob) ?? 99) < 18;
  const payment = watch("paymentArrangement");

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ id: string; patientCode: string }>("/api/patients", { method: "POST", json: body }),
    onSuccess: (created) => {
      toast.success(`Patient ${created.patientCode} registered`);
      void queryClient.invalidateQueries({ queryKey: ["patients"] });
      onOpenChange(false);
      onRegistered(created.id);
      form.reset();
      setStep(0);
    },
    onError: (err: Error) => toast.error("Registration failed", { description: err.message }),
  });

  const onSubmit = handleSubmit((values) => {
    const body: Record<string, unknown> = {
      firstName: values.firstName.trim(),
      middleName: values.middleName.trim() || undefined,
      lastName: values.lastName.trim(),
      dateOfBirth: values.dateOfBirth || undefined,
      gender: values.gender || undefined,
      phone: values.phone.trim(),
      altPhone: values.altPhone.trim() || undefined,
      email: values.email.trim() || undefined,
      address: values.address.trim() || undefined,
      occupation: values.occupation.trim() || undefined,
      maritalStatus: values.maritalStatus || undefined,
      nationality: values.nationality.trim() || undefined,
      emergencyContacts: values.emergencyContacts
        .filter((c) => c.fullName.trim() || c.relationship.trim() || c.phone.trim())
        .map((c) => ({
          fullName: c.fullName.trim(),
          relationship: c.relationship.trim(),
          phone: c.phone.trim(),
          altPhone: c.altPhone.trim() || undefined,
          address: c.address.trim() || undefined,
          isNextOfKin: c.isNextOfKin,
        })),
      medicalHistory: values.medicalHistory.map((m) => ({
        type: m.type,
        name: m.name.trim(),
        details: m.details.trim() || undefined,
      })),
      referral: values.referral.source
        ? {
            source: values.referral.source,
            referrerName: values.referral.referrerName.trim() || undefined,
            referrerContact: values.referral.referrerContact.trim() || undefined,
            referralDate: values.referral.referralDate || undefined,
            notes: values.referral.notes.trim() || undefined,
          }
        : undefined,
      paymentArrangement: values.paymentArrangement,
      insurance:
        values.paymentArrangement === "INSURANCE"
          ? {
              providerId: values.insurance.providerId,
              membershipNumber: values.insurance.membershipNumber.trim(),
              policyNumber: values.insurance.policyNumber.trim() || undefined,
              validFrom: values.insurance.validFrom || undefined,
              validTo: values.insurance.validTo || undefined,
              principalMember: values.insurance.principalMember.trim() || undefined,
              relationshipToPrincipal: values.insurance.relationshipToPrincipal.trim() || undefined,
            }
          : undefined,
      consent: {
        treatmentConsent: values.consent.treatmentConsent,
        dataConsent: values.consent.dataConsent,
        signatureName: values.consent.signatureName.trim() || undefined,
        consentDate: values.consent.consentDate || undefined,
        guardianName: isMinor ? values.consent.guardianName.trim() || undefined : undefined,
        guardianRelationship: isMinor ? values.consent.guardianRelationship.trim() || undefined : undefined,
      },
    };
    createMutation.mutate(body);
  });

  const goNext = async () => {
    const valid = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && createMutation.isPending) return; // block close while submitting
    if (!nextOpen) {
      form.reset();
      setStep(0);
    }
    onOpenChange(nextOpen);
  };

  const err = (path: keyof FormValues | string) => {
    const keys = String(path).split(".");
    // walk nested FieldErrors for dotted paths
    let node: any = formState.errors;
    for (const k of keys) node = node?.[k];
    return node?.message as string | undefined;
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={handleClose}
      size="xl"
      title={(
        <>
          <AtomIcon name="UserPlus" className="h-4 w-4 text-teal-600" />
          Register new patient
        </>
      )}
      description="Complete each section. Fields marked * are required — the record is created on the final step."
    >
        <RegistrationStepper step={step} setStep={setStep} />

        {/* body */}
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SidePanelBody>
            {/* ---------- STEP 1: PERSONAL INFO ---------- */}
            {step === 0 ? <PersonalStep register={register} setValue={setValue} watch={watch} err={err} form={form} dob={dob} dupMatches={dupMatches} firstName={firstName} lastName={lastName} phone={phone} /> : null}

            {/* ---------- STEP 2: EMERGENCY CONTACTS ---------- */}
            {step === 1 ? <ContactsStep register={register} setValue={setValue} watch={watch} err={err} contacts={contacts} phone={phone} /> : null}

            {/* ---------- STEP 3: MEDICAL BACKGROUND ---------- */}
            {step === 2 ? <HistoryStep register={register} setValue={setValue} watch={watch} err={err} history={history} /> : null}

            {/* ---------- STEP 4: REFERRAL ---------- */}
            {step === 3 ? <ReferralStep register={register} setValue={setValue} watch={watch} /> : null}

            {/* ---------- STEP 5: PAYMENT + CONSENT ---------- */}
            {step === 4 ? <ConsentStep register={register} setValue={setValue} watch={watch} err={err} isMinor={isMinor} payment={payment} providers={providers} /> : null}
          </SidePanelBody>

          {/* footer */}
          <SidePanelFooter className="justify-between gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Step {step + 1} of {STEPS.length} · {STEPS[step].title}
            </p>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <Button type="button" variant="outline" onClick={() => (step === 0 ? handleClose(false) : setStep((s) => s - 1))} disabled={createMutation.isPending}>
                {step === 0 ? "Cancel" : (
                  <>
                    <AtomIcon name="ArrowLeft" className="mr-1.5 h-4 w-4" /> Back
                  </>
                )}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={() => void goNext()}>
                  Next <AtomIcon name="ArrowRight" className="ml-1.5 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> Registering…
                    </>
                  ) : (
                    <>
                      <AtomIcon name="UserPlus" className="mr-1.5 h-4 w-4" /> Register patient
                    </>
                  )}
                </Button>
              )}
            </div>
          </SidePanelFooter>
        </form>
    </SidePanel>
  );
}
