// ============ API: User account update (profile / role / activation / password reset) ============
// Business Rule 3: users are deactivated, never deleted. Deactivation revokes refresh tokens.
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission, hashPassword } from "@/server/api-exports";
import { revokeAllTokens } from "@/server/auth";
import { PERMS } from "@/lib/constants";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  roleId: z.string().optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const { id } = await ctx.params;

  const user = await db.user.findUnique({ where: { id }, include: { role: { select: { name: true } } } });
  if (!user || user.clinicId !== auth.clinicId) throw new ApiError(404, "User not found");

  const body = await parseBody(req, patchSchema);
  if (Object.keys(body).length === 0) throw new ApiError(400, "No changes provided");

  if (body.active === false && user.id === auth.userId) {
    throw new ApiError(400, "You cannot deactivate your own account");
  }

  let roleName = user.role.name;
  if (body.roleId && body.roleId !== user.roleId) {
    const role = await db.role.findUnique({ where: { id: body.roleId } });
    if (!role || role.clinicId !== auth.clinicId) throw new ApiError(400, "Invalid role");
    roleName = role.name;
  }

  const previousValues: Record<string, unknown> = { name: user.name, roleId: user.roleId, roleName: user.role.name, active: user.active };
  const newValues: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};

  if (body.name !== undefined && body.name !== user.name) { data.name = body.name.trim(); newValues.name = body.name.trim(); }
  if (body.roleId !== undefined && body.roleId !== user.roleId) { data.roleId = body.roleId; newValues.roleId = body.roleId; newValues.roleName = roleName; }
  if (body.active !== undefined && body.active !== user.active) { data.active = body.active; newValues.active = body.active; }
  let passwordReset = false;
  if (body.password !== undefined) { data.passwordHash = hashPassword(body.password); passwordReset = true; }

  if (Object.keys(data).length === 0 && !passwordReset) throw new ApiError(400, "No changes provided");

  const updated = await db.user.update({
    where: { id: user.id },
    data: data as never,
    include: { role: { select: { name: true, permissions: true } } },
  });

  // deactivation: kill any live refresh sessions
  if (body.active === false && user.active) {
    await revokeAllTokens(user.id);
  }

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: passwordReset && Object.keys(newValues).length === 0 ? "USER_PASSWORD_RESET" : "USER_UPDATED",
    entityType: "User",
    entityId: user.id,
    previousValues,
    newValues: passwordReset ? { ...newValues, password: "«reset»" } : newValues,
  });

  return json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    roleId: updated.roleId,
    roleName: updated.role.name,
    staffId: updated.staffId,
    active: updated.active,
  });
});
