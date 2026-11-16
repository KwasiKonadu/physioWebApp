// ============ API: User accounts (list / create) ============
import { z } from "zod";
import { db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit, requirePermission, hashPassword } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

function serialize(u: { id: string; email: string; name: string; roleId: string; staffId: string | null; active: boolean; createdAt: Date; role: { name: string; permissions: string } }, staffName: string | null) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roleId: u.roleId,
    roleName: u.role.name,
    staffId: u.staffId,
    staffName,
    active: u.active,
    createdAt: u.createdAt,
    permissionCount: (JSON.parse(u.role.permissions || "[]") as string[]).length,
  };
}

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const search = getQuery(req, "search");
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 50), 200);

  const where = {
    clinicId: auth.clinicId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total, roles, staffProfiles] = await Promise.all([
    db.user.findMany({
      where,
      include: { role: { select: { name: true, permissions: true } } },
      orderBy: [{ name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.count({ where }),
    db.role.findMany({ where: { clinicId: auth.clinicId }, select: { id: true, name: true, system: true, description: true } }),
    db.staffProfile.findMany({ where: { clinicId: auth.clinicId }, select: { id: true, firstName: true, lastName: true, staffCode: true } }),
  ]);

  const staffNames = new Map(staffProfiles.map((s) => [s.id, `${s.firstName} ${s.lastName}`]));

  return json({
    items: users.map((u) => serialize(u, u.staffId ? staffNames.get(u.staffId) || null : null)),
    total,
    page,
    pageSize,
    roles,
  });
});

const createSchema = z.object({
  email: z.string().email("Valid email required"),
  name: z.string().min(2, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.string().min(1, "Role is required"),
  staffId: z.string().optional().nullable(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const body = await parseBody(req, createSchema);
  const email = body.email.toLowerCase().trim();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, "A user with this email already exists");

  const role = await db.role.findUnique({ where: { id: body.roleId } });
  if (!role || role.clinicId !== auth.clinicId) throw new ApiError(400, "Invalid role");

  if (body.staffId) {
    const staff = await db.staffProfile.findUnique({ where: { id: body.staffId } });
    if (!staff || staff.clinicId !== auth.clinicId) throw new ApiError(400, "Invalid staff link");
  }

  const user = await db.user.create({
    data: {
      clinicId: auth.clinicId,
      email,
      passwordHash: hashPassword(body.password),
      name: body.name.trim(),
      roleId: body.roleId,
      staffId: body.staffId || null,
      active: true,
    },
    include: { role: { select: { name: true, permissions: true } } },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    newValues: { email: user.email, name: user.name, roleId: user.roleId, roleName: user.role.name, staffId: user.staffId },
  });

  return json(serialize(user, null), 201);
});
