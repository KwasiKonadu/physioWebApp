// ============ API: Staff profile detail (view / update) ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, parseJson,
  requireAuth, requirePermission,
} from "@/server/api-exports";
import { staffIdForUser } from "@/server/leave";
import { PERMS, STAFF_ROLES, EMPLOYMENT_STATUSES, REMUNERATION_METHODS } from "@/lib/constants";

const OPEN_EPISODE_STATUSES = ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW"];

const availabilitySchema = z.array(
  z.object({
    day: z.string().min(1),
    start: z.string().optional(),
    end: z.string().optional(),
  })
);

const patchSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  phone: z.string().optional(),
  jobTitle: z.string().min(1).optional(),
  department: z.string().optional(),
  staffRole: z.enum(STAFF_ROLES).optional(),
  employmentDate: z.string().optional().nullable(),
  employmentStatus: z.enum(EMPLOYMENT_STATUSES).optional(),
  branchId: z.string().optional().nullable(),
  professionalDesignation: z.string().optional().nullable(),
  specialization: z.string().optional().nullable(),
  qualifications: z.array(z.string()).optional(),
  availability: availabilitySchema.optional(),
  remunerationMethod: z.enum(REMUNERATION_METHODS).optional(),
  remunerationRateCents: z.number().int().min(0).optional().nullable(),
});

function serialize(s: {
  qualifications: string | null;
  availability: string | null;
  [key: string]: unknown;
}) {
  return {
    ...s,
    qualifications: parseJson<string[]>(s.qualifications, []),
    availability: parseJson<unknown[]>(s.availability, []),
  };
}

async function getStaffOr404(id: string, clinicId: string) {
  const staff = await db.staffProfile.findUnique({ where: { id } });
  if (!staff || staff.clinicId !== clinicId) throw new ApiError(404, "Staff member not found");
  return staff;
}

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const staff = await getStaffOr404(id, auth.clinicId);
  // anyone may open their own profile; other profiles need staff.view
  if ((await staffIdForUser(auth.userId)) !== staff.id) requirePermission(req, PERMS.staffView);

  const [branch, linkedUser, completedSessions, uniquePatients, activeEpisodes] = await Promise.all([
    staff.branchId
      ? db.branch.findUnique({ where: { id: staff.branchId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    // link may be stored on either side
    db.user.findFirst({
      where: { clinicId: auth.clinicId, OR: [{ staffId: staff.id }, ...(staff.userId ? [{ id: staff.userId }] : [])] },
      select: { id: true, email: true, name: true, active: true, roleId: true, role: { select: { name: true } } },
    }),
    db.therapySession.count({ where: { clinicId: auth.clinicId, therapistId: staff.id, status: "COMPLETED" } }),
    db.therapySession.findMany({
      where: { clinicId: auth.clinicId, therapistId: staff.id, status: "COMPLETED" },
      distinct: ["patientId"],
      select: { patientId: true },
    }),
    db.treatmentEpisode.count({ where: { clinicId: auth.clinicId, therapistId: staff.id, status: { in: OPEN_EPISODE_STATUSES } } }),
  ]);

  return json({
    staff: serialize(staff),
    branchName: branch?.name || null,
    account: linkedUser
      ? { id: linkedUser.id, email: linkedUser.email, name: linkedUser.name, active: linkedUser.active, roleId: linkedUser.roleId, roleName: linkedUser.role.name }
      : null,
    stats: {
      completedSessions,
      uniquePatients: uniquePatients.length,
      activeEpisodes,
    },
  });
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.staffManage);
  const { id } = await ctx.params;
  const staff = await getStaffOr404(id, auth.clinicId);
  const body = await parseBody(req, patchSchema);

  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  const track = (key: string, prev: unknown, next: unknown) => {
    if (next === undefined) return;
    previousValues[key] = prev;
    newValues[key] = next;
  };

  const data: Record<string, unknown> = {};
  if (body.firstName !== undefined) { data.firstName = body.firstName.trim(); track("firstName", staff.firstName, data.firstName); }
  if (body.lastName !== undefined) { data.lastName = body.lastName.trim(); track("lastName", staff.lastName, data.lastName); }
  if (body.email !== undefined) { data.email = body.email ? body.email.toLowerCase().trim() : null; track("email", staff.email, data.email); }
  if (body.phone !== undefined) { data.phone = body.phone || null; track("phone", staff.phone, data.phone); }
  if (body.jobTitle !== undefined) { data.jobTitle = body.jobTitle.trim(); track("jobTitle", staff.jobTitle, data.jobTitle); }
  if (body.department !== undefined) { data.department = body.department || null; track("department", staff.department, data.department); }
  if (body.staffRole !== undefined) {
    data.staffRole = body.staffRole;
    data.isTherapist = body.staffRole === "PHYSIOTHERAPIST";
    track("staffRole", staff.staffRole, data.staffRole);
  }
  if (body.employmentDate !== undefined) {
    data.employmentDate = body.employmentDate ? new Date(body.employmentDate) : null;
    track("employmentDate", staff.employmentDate, body.employmentDate);
  }
  if (body.employmentStatus !== undefined) { data.employmentStatus = body.employmentStatus; track("employmentStatus", staff.employmentStatus, body.employmentStatus); }
  if (body.branchId !== undefined) { data.branchId = body.branchId || null; track("branchId", staff.branchId, data.branchId); }
  if (body.professionalDesignation !== undefined) { data.professionalDesignation = body.professionalDesignation || null; track("professionalDesignation", staff.professionalDesignation, data.professionalDesignation); }
  if (body.specialization !== undefined) { data.specialization = body.specialization || null; track("specialization", staff.specialization, data.specialization); }
  if (body.qualifications !== undefined) {
    data.qualifications = JSON.stringify(body.qualifications);
    track("qualifications", parseJson<string[]>(staff.qualifications, []), body.qualifications);
  }
  if (body.availability !== undefined) {
    data.availability = JSON.stringify(body.availability);
    track("availability", parseJson<unknown[]>(staff.availability, []), body.availability);
  }
  if (body.remunerationMethod !== undefined) { data.remunerationMethod = body.remunerationMethod; track("remunerationMethod", staff.remunerationMethod, body.remunerationMethod); }
  if (body.remunerationRateCents !== undefined) { data.remunerationRateCents = body.remunerationRateCents; track("remunerationRateCents", staff.remunerationRateCents, body.remunerationRateCents); }

  // only therapists can be paid per session / per patient; everyone else is salaried
  const willBeTherapist = (data.isTherapist as boolean | undefined) ?? staff.isTherapist;
  if (!willBeTherapist && ((data.remunerationMethod as string | undefined) ?? staff.remunerationMethod) !== "FIXED") {
    data.remunerationMethod = "FIXED";
    if (body.remunerationRateCents === undefined) data.remunerationRateCents = null;
  }

  if (Object.keys(data).length === 0) throw new ApiError(400, "No changes provided");

  const updated = await db.staffProfile.update({ where: { id: staff.id }, data: data as never });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "STAFF_UPDATED",
    entityType: "StaffProfile",
    entityId: staff.id,
    previousValues,
    newValues,
  });

  return json(serialize(updated));
});
