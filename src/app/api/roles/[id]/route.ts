// ============ API: Role permission update ============
// Business Rule 3: permission changes are audited (old vs new). System roles are editable but flagged.
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS, ALL_PERMS } from "@/lib/constants";

const patchSchema = z.object({
  permissions: z.array(z.string()).max(ALL_PERMS.length),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const { id } = await ctx.params;

  const role = await db.role.findUnique({ where: { id } });
  if (!role || role.clinicId !== auth.clinicId) throw new ApiError(404, "Role not found");

  const body = await parseBody(req, patchSchema);
  const invalid = body.permissions.filter((p) => !ALL_PERMS.includes(p as never));
  if (invalid.length > 0) throw new ApiError(400, `Unknown permissions: ${invalid.join(", ")}`);
  const permissions = [...new Set(body.permissions)];

  const previous = JSON.parse(role.permissions || "[]") as string[];

  const updated = await db.role.update({
    where: { id: role.id },
    data: { permissions: JSON.stringify(permissions) },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "ROLE_UPDATED",
    entityType: "Role",
    entityId: role.id,
    previousValues: { name: role.name, permissions: previous },
    newValues: { name: role.name, permissions },
  });

  return json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    permissions,
    system: updated.system,
  });
});
