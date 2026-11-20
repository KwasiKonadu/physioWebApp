// ============ Patients: directory list + full registration ============
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt,
  audit, notify, requireAuth, requirePermission, nextPatientCode,
} from "@/server/api-exports";
import {
  PERMS, PATIENT_STATUSES, PAYMENT_ARRANGEMENTS, REFERRAL_SOURCES,
  MEDICAL_HISTORY_TYPES, GENDERS, MARITAL_STATUSES,
} from "@/lib/constants";

// ---- helpers ----
/** Treat "" / null as undefined so optional fields stay optional. */
const optStr = (max = 255) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().max(max).optional());
const optDate = () =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.date().optional());
const optEnum = (values: readonly [string, ...string[]]) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.enum(values).optional());

const OPEN_EPISODE_STATUSES = [
  "AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN",
  "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW",
];

// ---- schemas ----
const emergencyContactSchema = z.object({
  fullName: z.string().trim().min(1, "Contact name is required").max(120),
  relationship: z.string().trim().min(1, "Relationship is required").max(80),
  phone: z.string().trim().min(1, "Contact phone is required").max(30),
  altPhone: optStr(30),
  address: optStr(255),
  isNextOfKin: z.boolean().optional(),
});

const medicalHistorySchema = z.object({
  type: z.enum(MEDICAL_HISTORY_TYPES),
  name: z.string().trim().min(1, "Entry name is required").max(160),
  details: optStr(1000),
});

const referralSchema = z.object({
  source: z.enum(REFERRAL_SOURCES),
  referrerName: optStr(120),
  referrerContact: optStr(80),
  referralDate: optDate(),
  notes: optStr(1000),
});

const insuranceSchema = z.object({
  providerId: z.string().trim().min(1, "Insurance provider is required"),
  membershipNumber: z.string().trim().min(1, "Membership number is required").max(60),
  policyNumber: optStr(60),
  validFrom: optDate(),
  validTo: optDate(),
  principalMember: optStr(120),
  relationshipToPrincipal: optStr(80),
  documentRef: optStr(120),
});

const consentSchema = z.object({
  treatmentConsent: z.boolean(),
  dataConsent: z.boolean(),
  signatureName: optStr(120),
  consentDate: optDate(),
  guardianName: optStr(120),
  guardianRelationship: optStr(80),
  documentRef: optStr(120),
});

const registerSchema = z
  .object({
    // personal info
    firstName: z.string().trim().min(1, "First name is required").max(80),
    middleName: optStr(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    dateOfBirth: optDate(),
    gender: optEnum(GENDERS),
    phone: z.string().trim().min(1, "Phone is required").max(30),
    altPhone: optStr(30),
    email: optStr(160),
    address: optStr(500),
    occupation: optStr(120),
    maritalStatus: optEnum(MARITAL_STATUSES),
    nationality: optStr(80),
    photoUrl: optStr(500),
    // related records
    emergencyContacts: z.array(emergencyContactSchema).optional().default([]),
    medicalHistory: z.array(medicalHistorySchema).optional().default([]),
    referral: referralSchema.optional(),
    // payment + insurance + consent
    paymentArrangement: z.enum(PAYMENT_ARRANGEMENTS).default("PAYG"),
    insurance: insuranceSchema.optional(),
    consent: consentSchema,
  })
  .superRefine((val, ctx) => {
    if (val.paymentArrangement === "INSURANCE" && !val.insurance) {
      ctx.addIssue({
        code: "custom",
        path: ["insurance"],
        message: "Insurance details are required for the INSURANCE payment arrangement",
      });
    }
    if (!val.consent.treatmentConsent) {
      ctx.addIssue({
        code: "custom",
        path: ["consent", "treatmentConsent"],
        message: "Treatment consent is required to register a patient",
      });
    }
  });

// ---- GET: paginated, filterable directory ----
export const GET = route(async (req) => {
  const auth = requireAuth(req);

  const search = getQuery(req, "search");
  const status = getQuery(req, "status");
  const arrangement = getQuery(req, "arrangement");
  const therapistId = getQuery(req, "therapistId");
  const page = Math.max(1, getQueryInt(req, "page", 1));
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 10)));
  const sortParam = getQuery(req, "sort") || "createdAt";
  const sortField = (["createdAt", "lastName", "patientCode"] as readonly string[]).includes(sortParam)
    ? (sortParam as "createdAt" | "lastName" | "patientCode")
    : "createdAt";
  const order = getQuery(req, "order") === "asc" ? "asc" : "desc";

  const where: Prisma.PatientWhereInput = { clinicId: auth.clinicId };
  const and: Prisma.PatientWhereInput[] = [];
  if (search && search.trim()) {
    // Split into tokens so "Kofi Mensah" matches firstName=Kofi AND lastName=Mensah,
    // while single tokens still match any field (name, code, phone).
    const tokens = search.trim().split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      and.push({
        OR: [
          { firstName: { contains: token, mode: "insensitive" } },
          { middleName: { contains: token, mode: "insensitive" } },
          { lastName: { contains: token, mode: "insensitive" } },
          { patientCode: { contains: token, mode: "insensitive" } },
          { phone: { contains: token, mode: "insensitive" } },
        ],
      });
    }
  }
  if (status && (PATIENT_STATUSES as readonly string[]).includes(status)) {
    and.push({ currentStatus: status });
  }
  if (arrangement && (PAYMENT_ARRANGEMENTS as readonly string[]).includes(arrangement)) {
    and.push({ paymentArrangement: arrangement });
  }
  if (therapistId && therapistId.trim()) {
    and.push({ assignedTherapistId: therapistId.trim() });
  }
  if (and.length > 0) where.AND = and;

  // ?countOnly=true → just the number (e.g. "patients assigned to this therapist"), no rows
  if (getQuery(req, "countOnly") === "true") return json({ total: await db.patient.count({ where }) });

  const [total, rows] = await Promise.all([
    db.patient.count({ where }),
    db.patient.findMany({
      relationLoadStrategy: "join",
      where,
      orderBy: { [sortField]: order } as Prisma.PatientOrderByWithRelationInput,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignedTherapist: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  // Follow-up: episode summary (active count + first open episode title) for the page items
  const ids = rows.map((r) => r.id);
  const episodes = ids.length
    ? await db.treatmentEpisode.findMany({
        where: { patientId: { in: ids } },
        orderBy: { openedDate: "desc" },
        select: { patientId: true, title: true, status: true, episodeNumber: true },
      })
    : [];

  const summary = new Map<string, { activeEpisodes: number; activeEpisodeTitle: string | null }>();
  for (const ep of episodes) {
    const entry = summary.get(ep.patientId) || { activeEpisodes: 0, activeEpisodeTitle: null };
    if (OPEN_EPISODE_STATUSES.includes(ep.status)) {
      entry.activeEpisodes += 1;
      if (!entry.activeEpisodeTitle) entry.activeEpisodeTitle = ep.title;
    }
    summary.set(ep.patientId, entry);
  }

  const items = rows.map((r) => {
    const s = summary.get(r.id);
    return {
      id: r.id,
      patientCode: r.patientCode,
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      gender: r.gender,
      dateOfBirth: r.dateOfBirth,
      phone: r.phone,
      email: r.email,
      photoUrl: r.photoUrl,
      paymentArrangement: r.paymentArrangement,
      currentStatus: r.currentStatus,
      createdAt: r.createdAt,
      assignedTherapist: r.assignedTherapist
        ? { id: r.assignedTherapistId, name: `${r.assignedTherapist.firstName} ${r.assignedTherapist.lastName}`.trim() }
        : null,
      activeEpisodes: s?.activeEpisodes ?? 0,
      activeEpisodeTitle: s?.activeEpisodeTitle ?? null,
    };
  });

  return json({ items, total, page, pageSize });
});

// ---- POST: full patient registration (single transaction) ----
export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.patientsManage);
  const body = await parseBody(req, registerSchema);

  const patientCode = await nextPatientCode(auth.clinicId);

  const created = await db.$transaction(async (tx) => {
    return tx.patient.create({
      data: {
        clinicId: auth.clinicId,
        patientCode,
        firstName: body.firstName,
        middleName: body.middleName ?? null,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth ?? null,
        gender: body.gender ?? null,
        phone: body.phone,
        altPhone: body.altPhone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        occupation: body.occupation ?? null,
        maritalStatus: body.maritalStatus ?? null,
        nationality: body.nationality ?? null,
        photoUrl: body.photoUrl ?? null,
        paymentArrangement: body.paymentArrangement,
        currentStatus: "NO_EPISODE",
        registeredById: auth.userId,
        emergencyContacts: {
          create: (body.emergencyContacts || []).map((c) => ({
            fullName: c.fullName,
            relationship: c.relationship,
            phone: c.phone,
            altPhone: c.altPhone ?? null,
            address: c.address ?? null,
            isNextOfKin: c.isNextOfKin ?? false,
          })),
        },
        medicalHistory: {
          create: (body.medicalHistory || []).map((m) => ({
            type: m.type,
            name: m.name,
            details: m.details ?? null,
          })),
        },
        ...(body.referral
          ? {
              referrals: {
                create: {
                  source: body.referral.source,
                  referrerName: body.referral.referrerName ?? null,
                  referrerContact: body.referral.referrerContact ?? null,
                  referralDate: body.referral.referralDate ?? null,
                  notes: body.referral.notes ?? null,
                },
              },
            }
          : {}),
        ...(body.paymentArrangement === "INSURANCE" && body.insurance
          ? {
              insurances: {
                create: {
                  providerId: body.insurance.providerId,
                  membershipNumber: body.insurance.membershipNumber,
                  policyNumber: body.insurance.policyNumber ?? null,
                  validFrom: body.insurance.validFrom ?? null,
                  validTo: body.insurance.validTo ?? null,
                  principalMember: body.insurance.principalMember ?? null,
                  relationshipToPrincipal: body.insurance.relationshipToPrincipal ?? null,
                  documentRef: body.insurance.documentRef ?? null,
                  status: "ACTIVE",
                },
              },
            }
          : {}),
        consents: {
          create: {
            treatmentConsent: body.consent.treatmentConsent,
            dataConsent: body.consent.dataConsent,
            signatureName: body.consent.signatureName ?? null,
            consentDate: body.consent.consentDate ?? null,
            guardianName: body.consent.guardianName ?? null,
            guardianRelationship: body.consent.guardianRelationship ?? null,
            documentRef: body.consent.documentRef ?? null,
          },
        },
      },
      include: {
        emergencyContacts: true,
        medicalHistory: true,
        consents: true,
        referrals: true,
        insurances: { include: { provider: { select: { id: true, name: true, code: true } } } },
        assignedTherapist: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PATIENT_REGISTERED",
    entityType: "Patient",
    entityId: created.id,
    newValues: {
      patientCode,
      firstName: body.firstName,
      lastName: body.lastName,
      paymentArrangement: body.paymentArrangement,
    },
  });

  await notify({
    clinicId: auth.clinicId,
    audienceRole: "RECEPTIONIST",
    type: "PATIENT_REGISTERED",
    title: "New patient registered",
    message: `${body.firstName} ${body.lastName} (${patientCode}) has been registered at the clinic.`,
    entityType: "Patient",
    entityId: created.id,
  });

  return json(created, 201);
});
