// ============ API: Branches — list + create ============
import { z } from "zod";
import { db, route, json, parseBody, getQuery, ApiError, audit, requireAuth, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const activeOnly = getQuery(req, "active") === "true";
  const items = await db.branch.findMany({
    where: { clinicId: auth.clinicId, ...(activeOnly ? { active: true } : {}) },
    orderBy: { name: "asc" },
  });
  return json({ items });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Branch name is required").max(120),
  address: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const body = await parseBody(req, createSchema);

  const clash = await db.branch.findFirst({
    where: { clinicId: auth.clinicId, name: { equals: body.name, mode: "insensitive" } },
  });
  if (clash) throw new ApiError(409, "A branch with this name already exists");

  const branch = await db.branch.create({
    data: { clinicId: auth.clinicId, name: body.name, address: body.address || null, phone: body.phone || null, active: true },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "BRANCH_CREATED",
    entityType: "Branch",
    entityId: branch.id,
    newValues: { name: branch.name, address: branch.address, phone: branch.phone },
  });

  return json({ branch }, 201);
});
