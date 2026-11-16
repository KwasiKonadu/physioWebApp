"use client";
// Wizard steps of the patient registration form.
import { type FieldPath, type PathValue, type UseFieldArrayReturn, type UseFormRegister, type UseFormReturn, type UseFormSetValue } from "react-hook-form";
import { calcAge } from "@/lib/format";
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
import { useDuplicates, useInsuranceProviders } from "./hooks";

type Watch = <P extends FieldPath<FormValues>>(name: P) => PathValue<FormValues, P>;
type DupMatches = NonNullable<ReturnType<typeof useDuplicates>["data"]>["items"];
import { FormValues, EMPTY_CONTACT } from "./registration-schema";

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
          <div className="space-y-1.5">
            <Label>First name *</Label>
            <Input {...register("firstName")} placeholder="Kofi" />
            {err("firstName") ? <p className="text-xs text-destructive">{err("firstName")}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Middle name</Label>
            <Input {...register("middleName")} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Last name *</Label>
            <Input {...register("lastName")} placeholder="Mensah" />
            {err("lastName") ? <p className="text-xs text-destructive">{err("lastName")}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <div className="flex items-center gap-2">
              <Input type="date" {...register("dateOfBirth")} className="min-w-0 flex-1" />
              <div className="w-20 shrink-0">
                <Input value={calcAge(dob)} readOnly placeholder="—" aria-label="Age" className="bg-muted text-center" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">Age auto-calculated</p>
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {GENDERS.map((g) => (
                  <SelectItem key={g} value={g}>{labelize(g)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Marital status</Label>
            <Select value={watch("maritalStatus")} onValueChange={(v) => setValue("maritalStatus", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {MARITAL_STATUSES.map((m) => (
                  <SelectItem key={m} value={m}>{labelize(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phone *</Label>
            <Input {...register("phone")} placeholder="+233 24 000 0000" />
            {err("phone") ? <p className="text-xs text-destructive">{err("phone")}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Alternative phone</Label>
            <Input {...register("altPhone")} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" {...register("email")} placeholder="name@example.com" />
            {err("email") ? <p className="text-xs text-destructive">{err("email")}</p> : null}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Residential address</Label>
            <Input {...register("address")} placeholder="Area, city" />
          </div>
          <div className="space-y-1.5">
            <Label>Occupation</Label>
            <Input {...register("occupation")} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Nationality</Label>
            <Input {...register("nationality")} placeholder="Ghanaian" />
          </div>
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
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input {...register(`emergencyContacts.${index}.fullName`)} placeholder="Full name" />
                {err(`emergencyContacts.${index}.fullName`) ? <p className="text-xs text-destructive">{err(`emergencyContacts.${index}.fullName`)}</p> : null}
              </div>
              <div className="space-y-1">
                <Label>Relationship *</Label>
                <Input {...register(`emergencyContacts.${index}.relationship`)} placeholder="Spouse, parent…" />
                {err(`emergencyContacts.${index}.relationship`) ? <p className="text-xs text-destructive">{err(`emergencyContacts.${index}.relationship`)}</p> : null}
              </div>
              <div className="space-y-1">
                <Label>Phone *</Label>
                <Input {...register(`emergencyContacts.${index}.phone`)} placeholder="+233 …" />
                {err(`emergencyContacts.${index}.phone`) ? <p className="text-xs text-destructive">{err(`emergencyContacts.${index}.phone`)}</p> : null}
              </div>
              <div className="space-y-1">
                <Label>Alt. phone</Label>
                <Input {...register(`emergencyContacts.${index}.altPhone`)} placeholder="Optional" />
              </div>
              <div className="space-y-1 sm:col-span-4">
                <Label>Address</Label>
                <Input {...register(`emergencyContacts.${index}.address`)} placeholder="Optional" />
              </div>
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
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={watch(`medicalHistory.${index}.type`)} onValueChange={(v) => setValue(`medicalHistory.${index}.type`, v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDICAL_HISTORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Name / description *</Label>
              <Input {...register(`medicalHistory.${index}.name`)} placeholder="e.g. Asthma, ACL surgery 2023" />
              {err(`medicalHistory.${index}.name`) ? <p className="text-xs text-destructive">{err(`medicalHistory.${index}.name`)}</p> : null}
            </div>
            <div className="space-y-1">
              <Label>Details</Label>
              <Input {...register(`medicalHistory.${index}.details`)} placeholder="Optional notes" />
            </div>
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
          <div className="space-y-1.5">
            <Label>Referral source</Label>
            <Select value={watch("referral.source")} onValueChange={(v) => setValue("referral.source", v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select source (optional)" /></SelectTrigger>
              <SelectContent>
                {REFERRAL_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Referrer name</Label>
            <Input {...register("referral.referrerName")} placeholder="e.g. Dr. Ampofo" />
          </div>
          <div className="space-y-1.5">
            <Label>Referrer contact</Label>
            <Input {...register("referral.referrerContact")} placeholder="Phone or email" />
          </div>
          <div className="space-y-1.5">
            <Label>Referral date</Label>
            <Input type="date" {...register("referral.referralDate")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea {...register("referral.notes")} rows={3} placeholder="Reason for referral, letter reference…" />
          </div>
        </div>
      </div>
  );
}

export function ConsentStep({ register, setValue, watch, err, isMinor, payment, providers }: { register: UseFormRegister<FormValues>; setValue: UseFormSetValue<FormValues>; watch: Watch; err: (path: string) => string | undefined; isMinor: boolean; payment: string; providers: ReturnType<typeof useInsuranceProviders> }) {
  return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Payment arrangement *</Label>
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
                  payment === option && "border-teal-500 bg-teal-50/60 ring-1 ring-teal-500/30"
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
        </div>

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
              <div className="space-y-1">
                <Label>Provider *</Label>
                <Select value={watch("insurance.providerId")} onValueChange={(v) => setValue("insurance.providerId", v, { shouldValidate: true })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {(providers.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err("insurance.providerId") ? <p className="text-xs text-destructive">{err("insurance.providerId")}</p> : null}
              </div>
              <div className="space-y-1">
                <Label>Membership number *</Label>
                <Input {...register("insurance.membershipNumber")} placeholder="e.g. NHIS-1234-5678" />
                {err("insurance.membershipNumber") ? <p className="text-xs text-destructive">{err("insurance.membershipNumber")}</p> : null}
              </div>
              <div className="space-y-1">
                <Label>Policy number</Label>
                <Input {...register("insurance.policyNumber")} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Principal member</Label>
                <Input {...register("insurance.principalMember")} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Relationship to principal</Label>
                <Input {...register("insurance.relationshipToPrincipal")} placeholder="e.g. Spouse, dependant" />
              </div>
              <div className="grid grid-cols-2 gap-3 *:min-w-0">
                <div className="space-y-1">
                  <Label>Valid from</Label>
                  <Input type="date" {...register("insurance.validFrom")} />
                </div>
                <div className="space-y-1">
                  <Label>Valid to</Label>
                  <Input type="date" {...register("insurance.validTo")} />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <Separator />

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <AtomIcon name="FileSignature" className="h-4 w-4 text-teal-600" />
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
            <div className="space-y-1">
              <Label>Signature name</Label>
              <Input {...register("consent.signatureName")} placeholder="Signed by" />
            </div>
            <div className="space-y-1">
              <Label>Consent date</Label>
              <Input type="date" {...register("consent.consentDate")} />
            </div>
          </div>
          {isMinor ? (
            <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-2 *:min-w-0">
              <p className="text-xs font-medium text-amber-800 sm:col-span-2">
                Patient is under 18 — guardian consent details are required.
              </p>
              <div className="space-y-1">
                <Label>Guardian name *</Label>
                <Input {...register("consent.guardianName")} placeholder="Parent / guardian" />
                {err("consent.guardianName") ? <p className="text-xs text-destructive">{err("consent.guardianName")}</p> : null}
              </div>
              <div className="space-y-1">
                <Label>Guardian relationship *</Label>
                <Input {...register("consent.guardianRelationship")} placeholder="e.g. Mother" />
                {err("consent.guardianRelationship") ? <p className="text-xs text-destructive">{err("consent.guardianRelationship")}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
  );
}
