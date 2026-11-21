// ============ API: Roles (list with permissions / role options / create custom role) ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requireAuth, requirePermission, can, parseJson } from "@/server/api-exports";
import { PERMS, ALL_PERMS, ROLE_NAMES } from "@/lib/constants";

export const GET = route(async (req) => {
  // Minimal options for the staff role dropdown — staff managers don't need settings access for this
  if (new URL(req.url).searchParams.get("options") === "true") {
    const a = requireAuth(req);
    if (!can(a, PERMS.staffManage) && !can(a, PERMS.staffView) && !can(a, PERMS.settingsManage)) {
      requirePermission(req, PERMS.staffManage);
    }
    const rows = await db.role.findMany({
      where: { clinicId: a.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, system: true },
    });
    return json({ items: rows.map((r) => ({ ...r, isTherapist: r.system && r.name === ROLE_NAMES.physiotherapist })) });
  }

  const auth = requirePermission(req, PERMS.settingsManage);

  const roles = await db.role.findMany({
    where: { clinicId: auth.clinicId },
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, staffProfiles: true } } },
  });

  return json({
    items: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: parseJson<string[]>(r.permissions, []),
      system: r.system,
      userCount: r._count.users,
      staffCount: r._count.staffProfiles,
    })),
    allPerms: ALL_PERMS,
  });
});

const createSchema = z.object({
  name: z.string().trim().min(2, "Role name is required").max(60),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  permissions: z.array(z.string()).max(ALL_PERMS.length).default([]),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const body = await parseBody(req, createSchema);

  const invalid = body.permissions.filter((p) => !ALL_PERMS.includes(p as never));
  if (invalid.length > 0) throw new ApiError(400, `Unknown permissions: ${invalid.join(", ")}`);
  const permissions = [...new Set(body.permissions)];

  const existing = await db.role.findFirst({
    where: { clinicId: auth.clinicId, name: { equals: body.name, mode: "insensitive" } },
  });
  if (existing) throw new ApiError(409, "A role with this name already exists");

  const role = await db.role.create({
    data: {
      clinicId: auth.clinicId,
      name: body.name,
      description: body.description || null,
      permissions: JSON.stringify(permissions),
      system: false,
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "ROLE_CREATED",
    entityType: "Role",
    entityId: role.id,
    newValues: { name: role.name, permissions },
  });

  return json({ id: role.id, name: role.name, description: role.description, permissions, system: false, userCount: 0, staffCount: 0 }, 201);
});
