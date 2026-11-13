"use client";
// ============ Patient registration: 5-step wizard with duplicate detection ============
import { useEffect, useState } from "react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ymd, calcAge } from "@/lib/format";
import { GENDERS, MARITAL_STATUSES, MEDICAL_HISTORY_TYPES, REFERRAL_SOURCES, labelize } from "@/lib/constants";
import { AtomIcon } from "@/components/atoms/icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
import { useDuplicates, useDebounced, useInsuranceProviders } from "./hooks";

// ---- validation ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const contactSchema = z.object({
  fullName: z.string().max(120),
  relationship: z.string().max(80),
  phone: z.string().max(30),
  altPhone: z.string().max(30),
  address: z.string().max(255),
  isNextOfKin: z.boolean(),
});

const contactsSchema = z.array(contactSchema).superRefine((rows, ctx) => {
  rows.forEach((row, i) => {
    const anyFilled = row.fullName.trim() || row.relationship.trim() || row.phone.trim();
    if (!anyFilled) return; // completely empty rows are ignored
    if (!row.fullName.trim()) ctx.addIssue({ code: "custom", path: [i, "fullName"], message: "Contact name is required" });
    if (!row.relationship.trim()) ctx.addIssue({ code: "custom", path: [i, "relationship"], message: "Relationship is required" });
    if (!row.phone.trim()) ctx.addIssue({ code: "custom", path: [i, "phone"], message: "Phone is required" });
  });
});

const historySchema = z.object({
  type: z.string().min(1, "Type is required"),
  name: z.string().trim().min(1, "Name is required").max(160),
  details: z.string().max(1000),
});

const formSchema = z
  .object({
    // step 1 — personal
    firstName: z.string().trim().min(1, "First name is required").max(80),
    middleName: z.string().max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    dateOfBirth: z.string(),
    gender: z.string(),
    phone: z.string().trim().min(1, "Phone is required").max(30),
    altPhone: z.string().max(30),
    email: z.string().max(160).refine((v) => v === "" || EMAIL_RE.test(v), "Invalid email address"),
    address: z.string().max(500),
    occupation: z.string().max(120),
    maritalStatus: z.string(),
    nationality: z.string().max(80),
    // step 2 — contacts
    emergencyContacts: contactsSchema,
    // step 3 — medical background
    medicalHistory: z.array(historySchema),
    // step 4 — referral
    referral: z.object({
      source: z.string(),
      referrerName: z.string().max(120),
      referrerContact: z.string().max(80),
      referralDate: z.string(),
      notes: z.string().max(1000),
    }),
    // step 5 — payment + consent
    paymentArrangement: z.enum(["PAYG", "PACKAGE", "INSURANCE"]),
    insurance: z.object({
      providerId: z.string(),
      membershipNumber: z.string().max(60),
      policyNumber: z.string().max(60),
      validFrom: z.string(),
      validTo: z.string(),
      principalMember: z.string().max(120),
      relationshipToPrincipal: z.string().max(80),
    }),
    consent: z.object({
      treatmentConsent: z.boolean(),
      dataConsent: z.boolean(),
      signatureName: z.string().max(120),
      consentDate: z.string(),
      guardianName: z.string().max(120),
      guardianRelationship: z.string().max(80),
    }),
  })
  .superRefine((val, ctx) => {
    if (val.paymentArrangement === "INSURANCE") {
      if (!val.insurance.providerId) {
        ctx.addIssue({ code: "custom", path: ["insurance", "providerId"], message: "Select an insurance provider" });
      }
      if (!val.insurance.membershipNumber.trim()) {
        ctx.addIssue({ code: "custom", path: ["insurance", "membershipNumber"], message: "Membership number is required" });
      }
    }
    if (!val.consent.treatmentConsent) {
      ctx.addIssue({ code: "custom", path: ["consent", "treatmentConsent"], message: "Treatment consent is required" });
    }
    if (!val.consent.dataConsent) {
      ctx.addIssue({ code: "custom", path: ["consent", "dataConsent"], message: "Data protection consent is required" });
    }
    const age = ageFromDob(val.dateOfBirth);
    if (age !== null && age < 18) {
      if (!val.consent.guardianName.trim()) {
        ctx.addIssue({ code: "custom", path: ["consent", "guardianName"], message: "Guardian name is required for patients under 18" });
      }
      if (!val.consent.guardianRelationship.trim()) {
        ctx.addIssue({ code: "custom", path: ["consent", "guardianRelationship"], message: "Guardian relationship is required" });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

const STEPS = [
  { title: "Personal info", icon: "User" },
  { title: "Emergency contacts", icon: "PhoneCall" },
  { title: "Medical background", icon: "HeartPulse" },
  { title: "Referral", icon: "Share2" },
  { title: "Payment & consent", icon: "Wallet" },
];

const STEP_FIELDS: FieldPath<FormValues>[][] = [
  ["firstName", "lastName", "phone", "email", "dateOfBirth"],
  ["emergencyContacts"],
  ["medicalHistory"],
  ["referral.source", "referral.referrerName", "referral.referrerContact"],
  [
    "paymentArrangement", "insurance.providerId", "insurance.membershipNumber",
    "consent.treatmentConsent", "consent.dataConsent", "consent.signatureName",
    "consent.guardianName", "consent.guardianRelationship",
  ],
];

const EMPTY_CONTACT = { fullName: "", relationship: "", phone: "", altPhone: "", address: "", isNextOfKin: false };

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

  const { register, watch, setValue, trigger, handleSubmit, reset, formState } = form;
  const contacts = useFieldArray({ control: form.control, name: "emergencyContacts" });
  const history = useFieldArray({ control: form.control, name: "medicalHistory" });

  // ---- duplicate detection (step 1) ----
  const phone = watch("phone");
  const firstName = watch("firstName");
  const lastName = watch("lastName");
  const dob = watch("dateOfBirth");
  const dupKey = `${phone}|${firstName}|${lastName}|${dob}`;
  const debouncedDupKey = useDebounced(dupKey, 400);
  const [dupParams, setDupParams] = useState({ phone: "", firstName: "", lastName: "", dob: "" });
  useEffect(() => {
    const [p, f, l, d] = debouncedDupKey.split("|");
    setDupParams({ phone: p || "", firstName: f || "", lastName: l || "", dob: d || "" });
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[900px] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <AtomIcon name="UserPlus" className="h-4 w-4 text-teal-600" />
            Register new patient
          </DialogTitle>
          <DialogDescription>
            Complete each section. Fields marked * are required — the record is created on the final step.
          </DialogDescription>
        </DialogHeader>

        {/* stepper */}
        <div className="flex items-center gap-1 overflow-x-auto border-b px-5 py-3 custom-scrollbar">
          {STEPS.map((s, i) => (
            <div key={s.title} className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => (i < step ? setStep(i) : undefined)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  i === step && "bg-primary text-primary-foreground",
                  i < step && "bg-teal-50 text-teal-700 hover:bg-teal-100",
                  i > step && "text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                    i === step ? "bg-primary-foreground/20" : i < step ? "bg-teal-100" : "bg-muted"
                  )}
                >
                  {i < step ? <AtomIcon name="Check" className="h-3 w-3" /> : i + 1}
                </span>
                {s.title}
              </button>
              {i < STEPS.length - 1 ? <span className="mx-1 h-px w-3 bg-border sm:w-5" /> : null}
            </div>
          ))}
        </div>

        {/* body */}
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {/* ---------- STEP 1: PERSONAL INFO ---------- */}
            {step === 0 ? (
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

                <div className="grid gap-4 sm:grid-cols-3">
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
                      <Input type="date" {...register("dateOfBirth")} className="flex-1" />
                      <div className="w-20 shrink-0">
                        <Input value={calcAge(dob)} readOnly placeholder="—" aria-label="Age" className="bg-muted text-center" />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Age auto-calculated</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Gender</Label>
                    <Select value={watch("gender")} onValueChange={(v) => setValue("gender", v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
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
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
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
            ) : null}

            {/* ---------- STEP 2: EMERGENCY CONTACTS ---------- */}
            {step === 1 ? (
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
                    <div className="grid gap-3 sm:grid-cols-4">
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
            ) : null}

            {/* ---------- STEP 3: MEDICAL BACKGROUND ---------- */}
            {step === 2 ? (
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
                  <div key={field.id} className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[160px_1fr_1fr_40px]">
                    <div className="space-y-1">
                      <Label>Type</Label>
                      <Select value={watch(`medicalHistory.${index}.type`)} onValueChange={(v) => setValue(`medicalHistory.${index}.type`, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
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
            ) : null}

            {/* ---------- STEP 4: REFERRAL ---------- */}
            {step === 3 ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Referral source</Label>
                    <Select value={watch("referral.source")} onValueChange={(v) => setValue("referral.source", v)}>
                      <SelectTrigger><SelectValue placeholder="Select source (optional)" /></SelectTrigger>
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
            ) : null}

            {/* ---------- STEP 5: PAYMENT + CONSENT ---------- */}
            {step === 4 ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Payment arrangement *</Label>
                  <RadioGroup
                    value={payment}
                    onValueChange={(v) => setValue("paymentArrangement", v as FormValues["paymentArrangement"], { shouldValidate: true })}
                    className="grid gap-3 sm:grid-cols-3"
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
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Provider *</Label>
                        <Select value={watch("insurance.providerId")} onValueChange={(v) => setValue("insurance.providerId", v, { shouldValidate: true })}>
                          <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
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
                      <div className="grid grid-cols-2 gap-3">
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
                  <div className="grid gap-3 sm:grid-cols-3">
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
                    <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-2">
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
            ) : null}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
