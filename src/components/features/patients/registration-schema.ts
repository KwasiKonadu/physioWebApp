// Patient registration: validation schema, step definitions and field lists.
import { z } from "zod";
import type { FieldPath } from "react-hook-form";

// ---- validation ----
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export const contactSchema = z.object({
  fullName: z.string().max(120),
  relationship: z.string().max(80),
  phone: z.string().max(30),
  altPhone: z.string().max(30),
  address: z.string().max(255),
  isNextOfKin: z.boolean(),
});

export const contactsSchema = z.array(contactSchema).superRefine((rows, ctx) => {
  rows.forEach((row, i) => {
    const anyFilled = row.fullName.trim() || row.relationship.trim() || row.phone.trim();
    if (!anyFilled) return; // completely empty rows are ignored
    if (!row.fullName.trim()) ctx.addIssue({ code: "custom", path: [i, "fullName"], message: "Contact name is required" });
    if (!row.relationship.trim()) ctx.addIssue({ code: "custom", path: [i, "relationship"], message: "Relationship is required" });
    if (!row.phone.trim()) ctx.addIssue({ code: "custom", path: [i, "phone"], message: "Phone is required" });
  });
});

export const historySchema = z.object({
  type: z.string().min(1, "Type is required"),
  name: z.string().trim().min(1, "Name is required").max(160),
  details: z.string().max(1000),
});

export const formSchema = z
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

export type FormValues = z.infer<typeof formSchema>;

export const STEPS = [
  { title: "Personal info", icon: "User" },
  { title: "Emergency contacts", icon: "PhoneCall" },
  { title: "Medical background", icon: "HeartPulse" },
  { title: "Referral", icon: "Share2" },
  { title: "Payment & consent", icon: "Wallet" },
];

export const STEP_FIELDS: FieldPath<FormValues>[][] = [
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

export const EMPTY_CONTACT = { fullName: "", relationship: "", phone: "", altPhone: "", address: "", isNextOfKin: false };
