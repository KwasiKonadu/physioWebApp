// ============ API: Audit log (searchable, paginated, newest first) ============
import { db, route, json, getQuery, getQueryInt, requirePermission, parseJson } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.settingsManage);

  const entityType = getQuery(req, "entityType");
  const entityId = getQuery(req, "entityId");
  const search = getQuery(req, "search");
  const fromStr = getQuery(req, "from");
  const toStr = getQuery(req, "to");
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 200);

  let from: Date | null = null;
  let to: Date | null = null;
  if (fromStr) {
    const d = new Date(fromStr);
    if (!Number.isNaN(d.getTime())) { d.setHours(0, 0, 0, 0); from = d; }
  }
  if (toStr) {
    const d = new Date(toStr);
    if (!Number.isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); to = d; }
  }

  const where = {
    clinicId: auth.clinicId,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(search
      ? {
          OR: [
            { userName: { contains: search } },
            { action: { contains: search } },
          ],
        }
      : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [logs, total, entityTypes] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where: { clinicId: auth.clinicId },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);

  return json({
    items: logs.map((l) => ({
      id: l.id,
      userId: l.userId,
      userName: l.userName,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      previousValues: parseJson<unknown>(l.previousValues, null),
      newValues: parseJson<unknown>(l.newValues, null),
      reason: l.reason,
      createdAt: l.createdAt,
    })),
    total,
    page,
    pageSize,
    entityTypes: entityTypes.map((e) => e.entityType),
  });
});
