// ============ Patient profile: full bundle (GET) + demographic/related updates (PATCH) ============
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, ApiError, audit,
  requireAuth, requirePermission, parseJson,
} from "@/server/api-exports";
import {
  PERMS, PAYMENT_ARRANGEMENTS, GENDERS, MARITAL_STATUSES, MEDICAL_HISTORY_TYPES,
} from "@/lib/constants";

// ---- helpers ----
const optStr = (max = 255) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().max(max).optional());
const optDate = () =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.date().optional());
const optEnum = (values: readonly [string, ...string[]]) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.enum(values).optional());

const HOLD_ENTRY_FALLBACK: { date: string; reason: string; notes?: string }[] = [];

/** Load the complete patient profile bundle. */
async function loadBundle(id: string, clinicId: string) {
  const patient = await db.patient.findFirst({
    where: { id, clinicId },
    include: {
      assignedTherapist: {
        select: { id: true, firstName: true, lastName: true, jobTitle: true, professionalDesignation: true },
      },
      emergencyContacts: { orderBy: { fullName: "asc" } },
      medicalHistory: { orderBy: [{ type: "asc" }, { name: "asc" }] },
      consents: { orderBy: { createdAt: "desc" } },
      referrals: { orderBy: { createdAt: "desc" } },
      insurances: {
        orderBy: { createdAt: "desc" },
        include: { provider: { select: { id: true, name: true, code: true, coveragePercent: true } } },
      },
    },
  });
  if (!patient) throw new ApiError(404, "Patient not found");

  const [episodes, appointments, patientPackages, invoices, sessionCount, sessionCompleted, assessmentCount, openInvoices, lastPayment] =
    await Promise.all([
      db.treatmentEpisode.findMany({
        where: { patientId: id },
        orderBy: { openedDate: "desc" },
        include: {
          therapist: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { sessions: true, assessments: true, plans: true, reviews: true, appointments: true, diagnoses: true } },
        },
      }),
      db.appointment.findMany({
        where: { patientId: id },
        orderBy: [{ date: "desc" }, { startMin: "desc" }],
        take: 20,
        include: {
          therapist: { select: { id: true, firstName: true, lastName: true } },
          episode: { select: { id: true, title: true, episodeNumber: true } },
        },
      }),
      db.patientPackage.findMany({
        where: { patientId: id },
        orderBy: { purchaseDate: "desc" },
        include: {
          package: { select: { id: true, name: true, sessions: true, priceCents: true } },
          _count: { select: { transactions: true } },
        },
      }),
      db.invoice.findMany({
        where: { patientId: id },
        orderBy: { issuedAt: "desc" },
        take: 20,
        select: {
          id: true, invoiceNumber: true, status: true, arrangement: true,
          totalCents: true, paidCents: true, insuranceCoveredCents: true, issuedAt: true, dueDate: true, episodeId: true,
          claim: { select: { id: true, claimNumber: true, status: true, claimedCents: true, approvedCents: true } },
        },
      }),
      db.therapySession.count({ where: { patientId: id } }),
      db.therapySession.count({ where: { patientId: id, status: "COMPLETED" } }),
      db.assessment.count({ where: { episode: { patientId: id } } }),
      db.invoice.aggregate({
        where: { patientId: id, status: { in: ["UNPAID", "PARTIAL"] } },
        _count: { _all: true },
        _sum: { totalCents: true, paidCents: true },
      }),
      db.payment.findFirst({
        where: { invoice: { patientId: id } },
        orderBy: { paidAt: "desc" },
        select: { amountCents: true, method: true, paidAt: true },
      }),
    ]);

  return {
    patient: {
      id: patient.id,
      clinicId: patient.clinicId,
      branchId: patient.branchId,
      patientCode: patient.patientCode,
      firstName: patient.firstName,
      middleName: patient.middleName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth,
      gender: patient.gender,
      phone: patient.phone,
      altPhone: patient.altPhone,
      email: patient.email,
      address: patient.address,
      occupation: patient.occupation,
      maritalStatus: patient.maritalStatus,
      nationality: patient.nationality,
      photoUrl: patient.photoUrl,
      paymentArrangement: patient.paymentArrangement,
      currentStatus: patient.currentStatus,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
      assignedTherapist: patient.assignedTherapist,
    },
    emergencyContacts: patient.emergencyContacts,
    medicalHistory: patient.medicalHistory,
    consents: patient.consents,
    referrals: patient.referrals,
    insurances: patient.insurances,
    episodes: episodes.map((e) => ({
      ...e,
      holdHistory: parseJson(e.holdHistory, HOLD_ENTRY_FALLBACK),
    })),
    appointments,
    patientPackages,
    invoices,
    billing: {
      outstandingCents: Math.max(0, (openInvoices._sum.totalCents ?? 0) - (openInvoices._sum.paidCents ?? 0)),
      unpaidInvoices: openInvoices._count._all,
      lastPayment,
    },
    stats: {
      episodes: episodes.length,
      openEpisodes: episodes.filter((e) =>
        ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW"].includes(e.status)
      ).length,
      sessions: sessionCount,
      sessionsCompleted: sessionCompleted,
      assessments: assessmentCount,
      activePackages: patientPackages.filter((p) => p.status === "ACTIVE").length,
    },
  };
}

/**
 * Lightweight patient lookup for forms (booking, plans, assessments, invoices): identity, insurance
 * memberships and episodes only — 2 queries instead of the 10 behind the full profile bundle.
 */
async function loadSummary(id: string, clinicId: string) {
  const [patient, episodes] = await Promise.all([
    db.patient.findFirst({
      where: { id, clinicId },
      select: {
        id: true, patientCode: true, firstName: true, middleName: true, lastName: true, phone: true,
        currentStatus: true, paymentArrangement: true,
        insurances: {
          orderBy: { createdAt: "desc" },
          include: { provider: { select: { id: true, name: true, code: true, coveragePercent: true } } },
        },
      },
    }),
    db.treatmentEpisode.findMany({
      where: { patientId: id, clinicId },
      orderBy: { openedDate: "desc" },
      select: {
        id: true, title: true, status: true, episodeNumber: true, openedDate: true,
        therapist: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);
  if (!patient) throw new ApiError(404, "Patient not found");
  const { insurances, ...rest } = patient;
  return { patient: rest, insurances, episodes };
}

// ---- GET (?view=summary for the lightweight form lookup, otherwise the full profile bundle) ----
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  if (getQuery(req, "view") === "summary") return json(await loadSummary(id, auth.clinicId));
  const bundle = await loadBundle(id, auth.clinicId);
  return json(bundle);
});

// ---- PATCH: demographics + replace-style updates ----
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

/** PATCH variants: "" / null CLEAR the field (null), undefined leaves it unchanged. */
const emptyToNull = (v: unknown) => (v === null || (typeof v === "string" && v.trim() === "") ? null : v);
const clrStr = (max = 255) => z.preprocess(emptyToNull, z.string().max(max).nullable().optional());
const clrDate = () => z.preprocess(emptyToNull, z.coerce.date().nullable().optional());
const clrEnum = (values: readonly [string, ...string[]]) => z.preprocess(emptyToNull, z.enum(values).nullable().optional());

const patchSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  middleName: clrStr(80),
  lastName: z.string().trim().min(1).max(80).optional(),
  dateOfBirth: clrDate(),
  gender: clrEnum(GENDERS),
  phone: z.string().trim().min(1).max(30).optional(),
  altPhone: clrStr(30),
  email: clrStr(160),
  address: clrStr(500),
  occupation: clrStr(120),
  maritalStatus: clrEnum(MARITAL_STATUSES),
  nationality: clrStr(80),
  photoUrl: clrStr(500),
  paymentArrangement: z.enum(PAYMENT_ARRANGEMENTS).optional(),
  branchId: clrStr(64),
  emergencyContacts: z.array(emergencyContactSchema).optional(),
  medicalHistory: z.array(medicalHistorySchema).optional(),
  insurance: z.array(insuranceSchema).optional(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.patientsManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const existing = await db.patient.findFirst({
    where: { id, clinicId: auth.clinicId },
    select: { id: true, patientCode: true },
  });
  if (!existing) throw new ApiError(404, "Patient not found");

  // insurance providers must belong to this clinic (FK safety + scoping)
  if (body.insurance && body.insurance.length > 0) {
    const providerIds = [...new Set(body.insurance.map((i) => i.providerId))];
    const found = await db.insuranceProvider.findMany({
      where: { clinicId: auth.clinicId, id: { in: providerIds } },
      select: { id: true },
    });
    if (found.length !== providerIds.length) {
      throw new ApiError(400, "One or more insurance providers are invalid");
    }
  }

  await db.$transaction(async (tx) => {
    const data: Prisma.PatientUpdateInput = {};
    if (body.firstName !== undefined) data.firstName = body.firstName;
    if (body.middleName !== undefined) data.middleName = body.middleName ?? null;
    if (body.lastName !== undefined) data.lastName = body.lastName;
    if (body.dateOfBirth !== undefined) data.dateOfBirth = body.dateOfBirth ?? null;
    if (body.gender !== undefined) data.gender = body.gender ?? null;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.altPhone !== undefined) data.altPhone = body.altPhone ?? null;
    if (body.email !== undefined) data.email = body.email ?? null;
    if (body.address !== undefined) data.address = body.address ?? null;
    if (body.occupation !== undefined) data.occupation = body.occupation ?? null;
    if (body.maritalStatus !== undefined) data.maritalStatus = body.maritalStatus ?? null;
    if (body.nationality !== undefined) data.nationality = body.nationality ?? null;
    if (body.photoUrl !== undefined) data.photoUrl = body.photoUrl ?? null;
    if (body.paymentArrangement !== undefined) data.paymentArrangement = body.paymentArrangement;
    if (body.branchId !== undefined) data.branchId = body.branchId ?? null;

    if (Object.keys(data).length > 0) {
      await tx.patient.update({ where: { id }, data });
    }

    if (body.emergencyContacts) {
      await tx.emergencyContact.deleteMany({ where: { patientId: id } });
      if (body.emergencyContacts.length > 0) {
        await tx.emergencyContact.createMany({
          data: body.emergencyContacts.map((c) => ({
            patientId: id,
            fullName: c.fullName,
            relationship: c.relationship,
            phone: c.phone,
            altPhone: c.altPhone ?? null,
            address: c.address ?? null,
            isNextOfKin: c.isNextOfKin ?? false,
          })),
        });
      }
    }

    if (body.medicalHistory) {
      await tx.medicalHistoryEntry.deleteMany({ where: { patientId: id } });
      if (body.medicalHistory.length > 0) {
        await tx.medicalHistoryEntry.createMany({
          data: body.medicalHistory.map((m) => ({
            patientId: id,
            type: m.type,
            name: m.name,
            details: m.details ?? null,
          })),
        });
      }
    }

    if (body.insurance) {
      await tx.patientInsurance.deleteMany({ where: { patientId: id } });
      if (body.insurance.length > 0) {
        await tx.patientInsurance.createMany({
          data: body.insurance.map((i) => ({
            patientId: id,
            providerId: i.providerId,
            membershipNumber: i.membershipNumber,
            policyNumber: i.policyNumber ?? null,
            validFrom: i.validFrom ?? null,
            validTo: i.validTo ?? null,
            principalMember: i.principalMember ?? null,
            relationshipToPrincipal: i.relationshipToPrincipal ?? null,
            documentRef: i.documentRef ?? null,
            status: "ACTIVE",
          })),
        });
      }
    }
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PATIENT_UPDATED",
    entityType: "Patient",
    entityId: id,
    newValues: { patientCode: existing.patientCode, ...body },
  });

  const bundle = await loadBundle(id, auth.clinicId);
  return json(bundle);
});
