// ============ API: Roles (list with permissions) ============
import { db, route, json, requirePermission, parseJson } from "@/server/api-exports";
import { PERMS, ALL_PERMS } from "@/lib/constants";

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.settingsManage);

  const roles = await db.role.findMany({
    where: { clinicId: auth.clinicId },
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return json({
    items: roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: parseJson<string[]>(r.permissions, []),
      system: r.system,
      userCount: r._count.users,
    })),
    allPerms: ALL_PERMS,
  });
});
