// ============ API: Branch update (details / activate / deactivate) ============
// Branches are never deleted: staff and records may reference them, so they are switched off instead.
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

const patchSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required").max(120).optional(),
  address: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  active: z.boolean().optional(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const { id } = await ctx.params;

  const branch = await db.branch.findUnique({ where: { id } });
  if (!branch || branch.clinicId !== auth.clinicId) throw new ApiError(404, "Branch not found");

  const body = await parseBody(req, patchSchema);
  if (Object.keys(body).length === 0) throw new ApiError(400, "No changes provided");

  if (body.name && body.name.toLowerCase() !== branch.name.toLowerCase()) {
    const clash = await db.branch.findFirst({
      where: { clinicId: auth.clinicId, id: { not: id }, name: { equals: body.name, mode: "insensitive" } },
    });
    if (clash) throw new ApiError(409, "A branch with this name already exists");
  }

  // the clinic must keep at least one active branch
  if (body.active === false && branch.active) {
    const otherActive = await db.branch.count({ where: { clinicId: auth.clinicId, active: true, id: { not: id } } });
    if (otherActive === 0) throw new ApiError(400, "At least one branch must stay active");
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.address !== undefined) data.address = body.address || null;
  if (body.phone !== undefined) data.phone = body.phone || null;
  if (body.active !== undefined) data.active = body.active;

  const updated = await db.branch.update({ where: { id }, data: data as never });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: body.active !== undefined && Object.keys(body).length === 1 ? (body.active ? "BRANCH_ACTIVATED" : "BRANCH_DEACTIVATED") : "BRANCH_UPDATED",
    entityType: "Branch",
    entityId: id,
    previousValues: { name: branch.name, address: branch.address, phone: branch.phone, active: branch.active },
    newValues: data,
  });

  return json({ branch: updated });
});
