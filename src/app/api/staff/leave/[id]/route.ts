// ============ API: Decide on / cancel a leave request ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, notify, requireAuth,
} from "@/server/api-exports";
import { can } from "@/server/auth";
import { PERMS, LEAVE_TYPE_LABELS } from "@/lib/constants";
import { staffIdForUser, userIdForStaff } from "@/server/leave";

const patchSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "CANCELLED"]),
  decisionNote: z.string().optional().or(z.literal("")).transform((v) => v || null),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const leave = await db.leaveRequest.findUnique({ where: { id }, include: { staff: true } });
  if (!leave || leave.clinicId !== auth.clinicId) throw new ApiError(404, "Leave request not found");

  const manager = can(auth, PERMS.staffManage);
  if (!manager) {
    // an employee may only withdraw their own pending request
    const mine = (await staffIdForUser(auth.userId)) === leave.staffId;
    if (!(mine && body.status === "CANCELLED" && leave.status === "PENDING")) {
      throw new ApiError(403, `Missing permission: ${PERMS.staffManage}`);
    }
  }
  if (leave.status !== "PENDING" && !(leave.status === "APPROVED" && body.status === "CANCELLED")) {
    throw new ApiError(409, `A ${leave.status.toLowerCase()} request can't be changed`);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.leaveRequest.update({
      where: { id },
      data: { status: body.status, decidedById: auth.userId, decidedAt: new Date(), decisionNote: body.decisionNote },
    });
    // approval puts the staff member on leave; undoing an approval puts them back to active
    if (body.status === "APPROVED" && leave.staff.employmentStatus !== "TERMINATED") {
      await tx.staffProfile.update({ where: { id: leave.staffId }, data: { employmentStatus: "ON_LEAVE" } });
    } else if (body.status === "CANCELLED" && leave.status === "APPROVED" && leave.staff.employmentStatus === "ON_LEAVE") {
      await tx.staffProfile.update({ where: { id: leave.staffId }, data: { employmentStatus: "ACTIVE" } });
    }
    return row;
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: `LEAVE_${body.status}`, entityType: "LeaveRequest", entityId: id,
    previousValues: { status: leave.status }, newValues: { status: body.status },
  });

  // let the applicant know the outcome
  if (manager && (body.status === "APPROVED" || body.status === "REJECTED")) {
    const applicant = await userIdForStaff(leave.staffId);
    if (applicant && applicant !== auth.userId) {
      await notify({
        clinicId: auth.clinicId, userId: applicant, type: "LEAVE_DECISION",
        title: `Leave ${body.status === "APPROVED" ? "approved" : "rejected"}`,
        message: `Your ${(LEAVE_TYPE_LABELS[leave.type] ?? leave.type).toLowerCase()} request was ${body.status.toLowerCase()}.`,
        entityType: "LeaveRequest", entityId: id,
      });
    }
  }
  return json(updated);
});
