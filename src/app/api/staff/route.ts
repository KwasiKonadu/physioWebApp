// ============ API: Staff profiles (list / create / therapist options) ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt,
  ApiError, audit, parseJson, requireAuth, requirePermission, nextStaffCode, hashPassword,
} from "@/server/api-exports";
import { PERMS, STAFF_ROLES, EMPLOYMENT_STATUSES, REMUNERATION_METHODS, ROLE_NAMES } from "@/lib/constants";

const availabilitySchema = z.array(
  z.object({
    day: z.string().min(1),
    start: z.string().optional(),
    end: z.string().optional(),
  })
);

const createSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal("")).transform((v) => (v ? v.toLowerCase().trim() : null)),
  phone: z.string().optional().or(z.literal("")).transform((v) => v || null),
  jobTitle: z.string().min(1, "Job title is required"),
  department: z.string().optional().or(z.literal("")).transform((v) => v || null),
  staffRole: z.enum(STAFF_ROLES),
  employmentDate: z.string().optional().or(z.literal("")).transform((v) => v || null),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).default("ACTIVE"),
  branchId: z.string().optional().nullable(),
  professionalDesignation: z.string().optional().or(z.literal("")).transform((v) => v || null),
  specialization: z.string().optional().or(z.literal("")).transform((v) => v || null),
  qualifications: z.array(z.string()).default([]),
  availability: availabilitySchema.default([]),
  remunerationMethod: z.enum(REMUNERATION_METHODS).default("FIXED"),
  remunerationRateCents: z.number().int().min(0).optional().nullable(),
  createUser: z.boolean().default(false),
  createPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
});

// staffRole → system role name (for auto-created user accounts)
const ROLE_FOR_STAFF: Record<string, string> = {
  ADMIN: ROLE_NAMES.admin,
  RECEPTIONIST: ROLE_NAMES.receptionist,
  PHYSIOTHERAPIST: ROLE_NAMES.physiotherapist,
  MANAGEMENT: ROLE_NAMES.management,
};

function parseDateOnly(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = route(async (req) => {
  const auth = requireAuth(req);

  // ---- Shortcut: minimal therapist options (used by appointments/patients/sessions modules) ----
  if (getQuery(req, "therapists") === "true") {
    const therapists = await db.staffProfile.findMany({
      where: { clinicId: auth.clinicId, isTherapist: true },
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    return json({ items: therapists });
  }

  requirePermission(req, PERMS.staffView);

  const role = getQuery(req, "role");
  const status = getQuery(req, "status");
  const search = getQuery(req, "search");
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 200);

  const where = {
    clinicId: auth.clinicId,
    ...(role ? { staffRole: role } : {}),
    ...(status ? { employmentStatus: status } : {}),
    ...(search
      ? {
          AND: search.trim().split(/\s+/).filter(Boolean).map((t) => ({
            OR: [
              { firstName: { contains: t, mode: "insensitive" as const } },
              { lastName: { contains: t, mode: "insensitive" as const } },
              { email: { contains: t, mode: "insensitive" as const } },
              { phone: { contains: t, mode: "insensitive" as const } },
              { staffCode: { contains: t, mode: "insensitive" as const } },
              { jobTitle: { contains: t, mode: "insensitive" as const } },
            ],
          })),
        }
      : {}),
  };

  const [items, total, therapists, active, onLeave, branches, linkedUsers] = await Promise.all([
    db.staffProfile.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.staffProfile.count({ where }),
    db.staffProfile.count({ where: { clinicId: auth.clinicId, isTherapist: true } }),
    db.staffProfile.count({ where: { clinicId: auth.clinicId, employmentStatus: "ACTIVE" } }),
    db.staffProfile.count({ where: { clinicId: auth.clinicId, employmentStatus: "ON_LEAVE" } }),
    db.branch.findMany({ where: { clinicId: auth.clinicId }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { clinicId: auth.clinicId },
      select: { id: true, staffId: true, email: true, active: true },
    }),
  ]);

  const branchNames = new Map(branches.map((b) => [b.id, b.name]));
  // user may link via staff.userId or user.staffId
  const userByStaffId = new Map<string, { id: string; email: string; active: boolean }>();
  for (const u of linkedUsers) {
    if (u.staffId) userByStaffId.set(u.staffId, { id: u.id, email: u.email, active: u.active });
  }
  const userById = new Map(linkedUsers.map((u) => [u.id, { id: u.id, email: u.email, active: u.active }]));

  return json({
    items: items.map((s) => {
      const account = userByStaffId.get(s.id) || (s.userId ? userById.get(s.userId) || null : null);
      return {
        id: s.id,
        staffCode: s.staffCode,
        firstName: s.firstName,
        lastName: s.lastName,
        name: `${s.firstName} ${s.lastName}`,
        email: s.email,
        phone: s.phone,
        jobTitle: s.jobTitle,
        department: s.department,
        staffRole: s.staffRole,
        employmentStatus: s.employmentStatus,
        employmentDate: s.employmentDate,
        isTherapist: s.isTherapist,
        remunerationMethod: s.remunerationMethod,
        remunerationRateCents: s.remunerationRateCents,
        branchId: s.branchId,
        branchName: s.branchId ? branchNames.get(s.branchId) || null : null,
        hasAccount: !!account,
        accountActive: account ? account.active : false,
        accountId: account ? account.id : null,
        createdAt: s.createdAt,
      };
    }),
    total,
    page,
    pageSize,
    summary: { total, therapists, active, onLeave },
  });
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.staffManage);
  const body = await parseBody(req, createSchema);

  if (body.createUser) {
    if (!body.email) throw new ApiError(400, "Email is required when creating a user account");
    if (!body.createPassword) throw new ApiError(400, "Password is required when creating a user account");
    const existing = await db.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ApiError(409, "A user with this email already exists");
  }

  const staffCode = await nextStaffCode(auth.clinicId);

  const staff = await db.staffProfile.create({
    data: {
      clinicId: auth.clinicId,
      staffCode,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      email: body.email,
      phone: body.phone,
      jobTitle: body.jobTitle.trim(),
      department: body.department,
      staffRole: body.staffRole,
      employmentDate: body.employmentDate ? parseDateOnly(body.employmentDate) : null,
      employmentStatus: body.employmentStatus,
      branchId: body.branchId || null,
      professionalDesignation: body.professionalDesignation,
      specialization: body.specialization,
      qualifications: JSON.stringify(body.qualifications),
      availability: JSON.stringify(body.availability),
      // everyone can have a pay rate; only therapists can be paid per session / per patient (others are salaried)
      remunerationMethod: body.staffRole === "PHYSIOTHERAPIST" ? body.remunerationMethod : "FIXED",
      remunerationRateCents: body.remunerationRateCents || null,
      isTherapist: body.staffRole === "PHYSIOTHERAPIST",
    },
  });

  // Optionally provision a login account with a mapped system role
  if (body.createUser && body.email && body.createPassword) {
    const roleName = ROLE_FOR_STAFF[body.staffRole];
    const role = roleName
      ? await db.role.findUnique({ where: { clinicId_name: { clinicId: auth.clinicId, name: roleName } } })
      : null;
    if (!role) throw new ApiError(400, `No role found for staff role ${body.staffRole}`);
    const user = await db.user.create({
      data: {
        clinicId: auth.clinicId,
        email: body.email,
        passwordHash: hashPassword(body.createPassword),
        name: `${body.firstName} ${body.lastName}`.trim(),
        roleId: role.id,
        staffId: staff.id,
        active: true,
      },
    });
    await db.staffProfile.update({ where: { id: staff.id }, data: { userId: user.id } });
    await audit({
      clinicId: auth.clinicId,
      userId: auth.userId,
      userName: auth.name,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValues: { email: user.email, name: user.name, roleId: role.id, staffId: staff.id },
    });
  }

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "STAFF_CREATED",
    entityType: "StaffProfile",
    entityId: staff.id,
    newValues: {
      staffCode, firstName: staff.firstName, lastName: staff.lastName, jobTitle: staff.jobTitle,
      staffRole: staff.staffRole, employmentStatus: staff.employmentStatus,
      remunerationMethod: staff.remunerationMethod, remunerationRateCents: staff.remunerationRateCents,
    },
  });

  return json({
    ...staff,
    qualifications: parseJson<string[]>(staff.qualifications, []),
    availability: parseJson<unknown[]>(staff.availability, []),
  }, 201);
});
