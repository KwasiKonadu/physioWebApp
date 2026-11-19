// Helpers shared by the leave API routes.
import { db, notify } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

/** The staff profile linked to a login (User.staffId, or StaffProfile.userId as a fallback). */
export async function staffIdForUser(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { staffId: true } });
  if (user?.staffId) return user.staffId;
  const staff = await db.staffProfile.findFirst({ where: { userId }, select: { id: true } });
  return staff?.id ?? null;
}

/** Login ids of everyone who can approve leave (role has staff.manage). */
export async function leaveApproverIds(clinicId: string): Promise<string[]> {
  const users = await db.user.findMany({
    where: { clinicId, active: true },
    select: { id: true, role: { select: { permissions: true } } },
  });
  return users
    .filter((u) => {
      try { return (JSON.parse(u.role.permissions || "[]") as string[]).includes(PERMS.staffManage); } catch { return false; }
    })
    .map((u) => u.id);
}

export async function notifyApprovers(clinicId: string, opts: { title: string; message: string; entityId: string; exceptUserId?: string }) {
  const ids = (await leaveApproverIds(clinicId)).filter((id) => id !== opts.exceptUserId);
  await Promise.all(ids.map((userId) => notify({
    clinicId, userId, type: "LEAVE_REQUEST", title: opts.title, message: opts.message,
    entityType: "LeaveRequest", entityId: opts.entityId,
  })));
}

/** Login belonging to a staff member, if any. */
export async function userIdForStaff(staffId: string): Promise<string | null> {
  const u = await db.user.findFirst({ where: { staffId }, select: { id: true } });
  if (u) return u.id;
  const s = await db.staffProfile.findUnique({ where: { id: staffId }, select: { userId: true } });
  return s?.userId ?? null;
}
