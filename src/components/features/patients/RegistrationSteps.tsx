"use client";
// Wizard steps of the patient registration form.
import { type FieldPath, type PathValue, type UseFieldArrayReturn, type UseFormRegister, type UseFormReturn, type UseFormSetValue } from "react-hook-form";
import { calcAge, formatMoney } from "@/lib/format";
import { GENDERS, MARITAL_STATUSES, MEDICAL_HISTORY_TYPES, REFERRAL_SOURCES, labelize } from "@/lib/constants";
import { AtomIcon } from "@/components/atoms/icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDuplicates, useInsuranceProviders, usePackageOptions } from "./hooks";
import { Field } from "@/components/molecules/field";
import { FormValues, EMPTY_CONTACT } from "./registration-schema";

type Watch = <P extends FieldPath<FormValues>>(name: P) => PathValue<FormValues, P>;
type DupMatches = NonNullable<ReturnType<typeof useDuplicates>["data"]>["items"];

export function PersonalStep({ register, setValue, watch, err, form, dob, dupMatches, firstName, lastName, phone }: { register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch; err: (path: string) => string | undefined; form: UseFormReturn<FormValues>; dob: string; dupMatches: DupMatches; firstName: string; lastName: string; phone: string }) {
  return (
      <div className="space-y-4">
        {dupMatches.length > 0 ? (
          <Alert className="border-amber-200 bg-amber-50">
            <AtomIcon name="TriangleAlert" className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800">This may be an existing patient</AlertTitle>
            <AlertDescription className="text-amber-700">
              <p className="mb-2">We found similar records. If this is the same person, close this form and open their profile instead.</p>
              <ul className="space-y-1">
                {dupMatches.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-medium">{m.firstName} {m.lastName}</span>
                    <span className="font-mono text-xs">{m.patientCode}</span>
                    <span className="text-xs">{m.phone}</span>
                    {m.dateOfBirth ? <span className="text-xs">DOB {calcAge(m.dateOfBirth)}y</span> : null}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3 *:min-w-0">
          <Field label="First name" required error={err("firstName")}>
            <Input {...register("firstName")} placeholder="Kofi" />
          </Field>
          <Field label="Middle name">
            <Input {...register("middleName")} placeholder="Optional" />
          </Field>
          <Field label="Last name" required error={err("lastName")}>
            <Input {...register("lastName")} placeholder="Mensah" />
          </Field>
          <Field label="Date of birth">
            <div className="flex items-center gap-2">
              <Input type="date" {...register("dateOfBirth")} className="min-w-0 flex-1" />
              <div className="w-20 shrink-0">
                <Input value={calcAge(dob)} readOnly placeholder="—" aria-label="Age" className="bg-muted text-center" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Age auto-calculated</p>
          </Field>
          <Field label="Gender">
            <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>{labelize(g)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Marital status">
            <Select value={watch("maritalStatus")} onValueChange={(v) => setValue("maritalStatus", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {MARITAL_STATUSES.map((m) => (
                  <SelectItem key={m} value={m}>{labelize(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Phone" required error={err("phone")}>
            <Input {...register("phone")} placeholder="+233 24 000 0000" />
          </Field>
          <Field label="Alternative phone">
            <Input {...register("altPhone")} placeholder="Optional" />
          </Field>
          <Field label="Email" error={err("email")}>
            <Input type="email" {...register("email")} placeholder="name@example.com" />
          </Field>
          <Field label="Residential address" className="sm:col-span-2">
            <Input {...register("address")} placeholder="Area, city" />
          </Field>
          <Field label="Occupation">
            <Input {...register("occupation")} placeholder="Optional" />
          </Field>
          <Field label="Nationality">
            <Input {...register("nationality")} placeholder="Ghanaian" />
          </Field>
        </div>
      </div>
  );
}

export function ContactsStep({ register, setValue, watch, err, contacts, phone }: { register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch; err: (path: string) => string | undefined; contacts: UseFieldArrayReturn<FormValues, "emergencyContacts">; phone: string }) {
  return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Capture at least one emergency contact. Mark next of kin for the primary contact.
        </p>
        {contacts.fields.map((field, index) => (
          <div key={field.id} className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Contact {index + 1}</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={watch(`emergencyContacts.${index}.isNextOfKin`)}
                    onCheckedChange={(v) => setValue(`emergencyContacts.${index}.isNextOfKin`, v === true)}
                  />
                  Next of kin
                </label>
                {contacts.fields.length > 1 ? (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => contacts.remove(index)} aria-label="Remove contact">
                    <AtomIcon name="Trash2" className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 *:min-w-0">
              <Field label="Name" required error={err(`emergencyContacts.${index}.fullName`)}>
                <Input {...register(`emergencyContacts.${index}.fullName`)} placeholder="Full name" />
              </Field>
              <Field label="Relationship" required error={err(`emergencyContacts.${index}.relationship`)}>
                <Input {...register(`emergencyContacts.${index}.relationship`)} placeholder="Spouse, parent…" />
              </Field>
              <Field label="Phone" required error={err(`emergencyContacts.${index}.phone`)}>
                <Input {...register(`emergencyContacts.${index}.phone`)} placeholder="+233 …" />
              </Field>
              <Field label="Alt. phone">
                <Input {...register(`emergencyContacts.${index}.altPhone`)} placeholder="Optional" />
              </Field>
              <Field label="Address" className="sm:col-span-4">
                <Input {...register(`emergencyContacts.${index}.address`)} placeholder="Optional" />
              </Field>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => contacts.append({ ...EMPTY_CONTACT })}>
          <AtomIcon name="Plus" className="mr-2 h-4 w-4" />
          Add contact
        </Button>
      </div>
  );
}

export function HistoryStep({ register, setValue, watch, err, history }: { register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch; err: (path: string) => string | undefined; history: UseFieldArrayReturn<FormValues, "medicalHistory"> }) {
  return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => history.append({ type: "OTHER", name: "No relevant medical history", details: "" })}>
            <AtomIcon name="CircleCheck" className="mr-1.5 h-4 w-4 text-emerald-600" />
            No relevant medical history
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => history.append({ type: "OTHER", name: "Information unknown", details: "" })}>
            <AtomIcon name="CircleHelp" className="mr-1.5 h-4 w-4 text-amber-600" />
            Information unknown
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => history.append({ type: "CONDITION", name: "", details: "" })}>
            <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" />
            Add entry
          </Button>
        </div>

        {history.fields.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No medical history entries yet. Use the buttons above to record conditions, surgeries, injuries, medications or allergies.
          </p>
        ) : null}

        {history.fields.map((field, index) => (
          <div key={field.id} className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[160px_1fr_1fr_40px] *:min-w-0">
            <Field label="Type">
              <Select value={watch(`medicalHistory.${index}.type`)} onValueChange={(v) => setValue(`medicalHistory.${index}.type`, v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDICAL_HISTORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name / description" required error={err(`medicalHistory.${index}.name`)}>
              <Input {...register(`medicalHistory.${index}.name`)} placeholder="e.g. Asthma, ACL surgery 2023" />
            </Field>
            <Field label="Details">
              <Input {...register(`medicalHistory.${index}.details`)} placeholder="Optional notes" />
            </Field>
            <div className="flex items-end justify-end">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => history.remove(index)} aria-label="Remove entry">
                <AtomIcon name="Trash2" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
  );
}

export function ReferralStep({ register, setValue, watch }: { register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch }) {
  return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 *:min-w-0">
          <Field label="Referral source">
            <Select value={watch("referral.source")} onValueChange={(v) => setValue("referral.source", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select source (optional)" /></SelectTrigger>
              <SelectContent>
                {REFERRAL_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Referrer name">
            <Input {...register("referral.referrerName")} placeholder="e.g. Dr. Ampofo" />
          </Field>
          <Field label="Referrer contact">
            <Input {...register("referral.referrerContact")} placeholder="Phone or email" />
          </Field>
          <Field label="Referral date">
            <Input type="date" {...register("referral.referralDate")} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea {...register("referral.notes")} rows={3} placeholder="Reason for referral, letter reference…" />
          </Field>
        </div>
      </div>
  );
}

export function ConsentStep({ register, setValue, watch, err, isMinor, payment, providers }: { register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch; err: (path: string) => string | undefined; isMinor: boolean; payment: string; providers: ReturnType<typeof useInsuranceProviders> }) {
  return (
      <div className="space-y-5">
        <Field label="Payment arrangement" required>
          <RadioGroup
            value={payment}
            onValueChange={(v) => setValue("paymentArrangement", v as FormValues["paymentArrangement"], { shouldValidate: true })}
            className="grid gap-3 sm:grid-cols-3 *:min-w-0"
          >
            {(["PAYG", "PACKAGE", "INSURANCE"] as const).map((option) => (
              <Label
                key={option}
                htmlFor={`payment-${option}`}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-muted/40",
                  payment === option && "border-navy-800 bg-navy-50/60 ring-1 ring-navy-800/30"
                )}
              >
                <RadioGroupItem id={`payment-${option}`} value={option} className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold">{labelize(option)}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {option === "PAYG" && "Pay per session as delivered"}
                    {option === "PACKAGE" && "Pre-purchased session packages"}
                    {option === "INSURANCE" && "Covered by an insurance policy"}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </Field>

        {payment === "PACKAGE" ? <PackagePicker watch={watch} setValue={setValue} /> : null}

        {payment === "INSURANCE" ? (
          <div className="rounded-xl border bg-sky-50/40 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <AtomIcon name="ShieldCheck" className="h-4 w-4 text-sky-600" />
              Insurance details
            </p>
            {providers.isLoading ? (
              <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
            ) : (providers.data ?? []).length === 0 ? (
              <Alert className="border-amber-200 bg-amber-50">
                <AtomIcon name="TriangleAlert" className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">No insurance providers configured</AlertTitle>
                <AlertDescription className="text-amber-700">
                  Ask an administrator to add providers under Billing first, or choose another payment arrangement.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 *:min-w-0">
              <Field label="Provider" required error={err("insurance.providerId")}>
                <Select value={watch("insurance.providerId")} onValueChange={(v) => setValue("insurance.providerId", v, { shouldValidate: true })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {(providers.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Membership number" required error={err("insurance.membershipNumber")}>
                <Input {...register("insurance.membershipNumber")} placeholder="e.g. NHIS-1234-5678" />
              </Field>
              <Field label="Policy number">
                <Input {...register("insurance.policyNumber")} placeholder="Optional" />
              </Field>
              <Field label="Principal member">
                <Input {...register("insurance.principalMember")} placeholder="Optional" />
              </Field>
              <Field label="Relationship to principal">
                <Input {...register("insurance.relationshipToPrincipal")} placeholder="e.g. Spouse, dependant" />
              </Field>
              <div className="grid grid-cols-2 gap-3 *:min-w-0">
                <Field label="Valid from">
                  <Input type="date" {...register("insurance.validFrom")} />
                </Field>
                <Field label="Valid to">
                  <Input type="date" {...register("insurance.validTo")} />
                </Field>
              </div>
            </div>
          </div>
        ) : null}

        <Separator />

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AtomIcon name="FileSignature" className="h-4 w-4 text-navy-800" />
            Consent
          </p>
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={watch("consent.treatmentConsent")}
                onCheckedChange={(v) => setValue("consent.treatmentConsent", v === true, { shouldValidate: true })}
                className="mt-0.5"
              />
              <span>
                The patient consents to physiotherapy assessment and treatment *
                {err("consent.treatmentConsent") ? <span className="block text-xs text-destructive">{err("consent.treatmentConsent")}</span> : null}
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={watch("consent.dataConsent")}
                onCheckedChange={(v) => setValue("consent.dataConsent", v === true, { shouldValidate: true })}
                className="mt-0.5"
              />
              <span>
                The patient consents to their personal & clinical data being stored for care delivery *
                {err("consent.dataConsent") ? <span className="block text-xs text-destructive">{err("consent.dataConsent")}</span> : null}
              </span>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 *:min-w-0">
            <Field label="Signature name">
              <Input {...register("consent.signatureName")} placeholder="Signed by" />
            </Field>
            <Field label="Consent date">
              <Input type="date" {...register("consent.consentDate")} />
            </Field>
          </div>
          {isMinor ? (
            <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-2 *:min-w-0">
              <p className="text-xs font-medium text-amber-800 sm:col-span-2">
                Patient is under 18 — guardian consent details are required.
              </p>
              <Field label="Guardian name" required error={err("consent.guardianName")}>
                <Input {...register("consent.guardianName")} placeholder="Parent / guardian" />
              </Field>
              <Field label="Guardian relationship" required error={err("consent.guardianRelationship")}>
                <Input {...register("consent.guardianRelationship")} placeholder="e.g. Mother" />
              </Field>
            </div>
          ) : null}
        </div>
      </div>
  );
}


function PackagePicker({ watch, setValue }: { watch: Watch; setValue: UseFormSetValue<FormValues> }) {
  const packages = usePackageOptions(true);
  const selected = watch("packageIds") ?? [];
  const toggle = (id: string) =>
    setValue("packageIds", selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], { shouldDirty: true });

  return (
    <Field label="Packages">
      {packages.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : packages.isError ? (
        <p className="text-xs text-muted-foreground">Packages are unavailable right now. You can assign one later from the patient&apos;s Billing tab.</p>
      ) : !packages.data?.length ? (
        <p className="text-xs text-muted-foreground">No active packages are set up yet. Create one under Billing → Packages, or assign it later.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 *:min-w-0">
          {packages.data.map((pkg) => {
            const on = selected.includes(pkg.id);
            return (
              <Label
                key={pkg.id}
                htmlFor={`pkg-${pkg.id}`}
                className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40", on && "border-navy-800 bg-navy-50/60 ring-1 ring-navy-800/30")}
              >
                <Checkbox id={`pkg-${pkg.id}`} checked={on} onCheckedChange={() => toggle(pkg.id)} className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold">{pkg.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {pkg.sessions} sessions · valid {pkg.validityDays} days · {formatMoney(pkg.priceCents)}
                  </span>
                </span>
              </Label>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">Selected packages are assigned on registration with an unpaid invoice — record payment from Billing.</p>
    </Field>
  );
}
