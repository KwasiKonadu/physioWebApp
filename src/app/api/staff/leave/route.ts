// ============ API: Staff leave requests (list / create) ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt,
  ApiError, audit, requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS, LEAVE_TYPES, LEAVE_STATUSES, LEAVE_TYPE_LABELS } from "@/lib/constants";
import { can } from "@/server/auth";
import { staffIdForUser, notifyApprovers } from "@/server/leave";

const createSchema = z.object({
  // only managers may file on behalf of someone else; everyone else files for themselves
  staffId: z.string().optional(),
  type: z.enum(LEAVE_TYPES),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().optional().or(z.literal("")).transform((v) => v || null),
});

const DAY_MS = 86_400_000;

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const canViewAll = can(auth, PERMS.staffView);
  const myStaffId = await staffIdForUser(auth.userId);
  // people without staff.view only ever see their own requests
  if (!canViewAll && !myStaffId) return json({ items: [], total: 0, page: 1, pageSize: 20, myStaffId: null, summary: { pending: 0, upcomingApproved: 0 } });

  const status = getQuery(req, "status");
  const staffFilter = getQuery(req, "staffId");
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 200);
  const where = {
    clinicId: auth.clinicId,
    ...(canViewAll ? (staffFilter ? { staffId: staffFilter } : {}) : { staffId: myStaffId! }),
    ...(status && (LEAVE_STATUSES as readonly string[]).includes(status) ? { status } : {}),
  };

  const [items, total, pending, approved] = await Promise.all([
    db.leaveRequest.findMany({
      where,
      include: { staff: { select: { firstName: true, lastName: true, staffCode: true, jobTitle: true } } },
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.leaveRequest.count({ where }),
    db.leaveRequest.count({ where: { clinicId: auth.clinicId, status: "PENDING", ...(canViewAll ? {} : { staffId: myStaffId! }) } }),
    db.leaveRequest.count({ where: { clinicId: auth.clinicId, status: "APPROVED", endDate: { gte: new Date() }, ...(canViewAll ? {} : { staffId: myStaffId! }) } }),
  ]);

  return json({
    items: items.map(({ staff, ...l }) => ({
      ...l,
      staffName: `${staff.firstName} ${staff.lastName}`,
      staffCode: staff.staffCode,
      jobTitle: staff.jobTitle,
    })),
    total, page, pageSize, myStaffId,
    summary: { pending, upcomingApproved: approved },
  });
});

export const POST = route(async (req) => {
  const auth = requireAuth(req);
  const body = await parseBody(req, createSchema);

  const myStaffId = await staffIdForUser(auth.userId);
  const onBehalf = !!body.staffId && body.staffId !== myStaffId;
  if (onBehalf) requirePermission(req, PERMS.staffManage);

  const staffId = body.staffId || myStaffId;
  if (!staffId) throw new ApiError(400, "Your login isn't linked to a staff profile, so you can't apply for leave");
  const staff = await db.staffProfile.findUnique({ where: { id: staffId } });
  if (!staff || staff.clinicId !== auth.clinicId) throw new ApiError(404, "Staff member not found");

  const start = new Date(body.startDate);
  const end = new Date(body.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new ApiError(400, "Invalid dates");
  if (end < start) throw new ApiError(400, "End date cannot be before start date");
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

  const created = await db.leaveRequest.create({
    data: { clinicId: auth.clinicId, staffId: staff.id, type: body.type, startDate: start, endDate: end, days, reason: body.reason },
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "LEAVE_REQUESTED", entityType: "LeaveRequest", entityId: created.id,
    newValues: { staffId: staff.id, type: body.type, days },
  });

  // tell the approvers (admins) there's a request waiting
  await notifyApprovers(auth.clinicId, {
    title: "New leave request",
    message: `${staff.firstName} ${staff.lastName} requested ${days} day${days === 1 ? "" : "s"} off (${(LEAVE_TYPE_LABELS[body.type] ?? body.type).toLowerCase()}).`,
    entityId: created.id,
    exceptUserId: auth.userId,
  });
  return json(created, 201);
});
