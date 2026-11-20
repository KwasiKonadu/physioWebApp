// ============ Stock movements: the full ledger, filterable ============
import { db, route, json, getQuery, getQueryInt, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { serializeMovement } from "../_lib";

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.inventoryView);
  const search = (getQuery(req, "search") || "").trim();
  const type = getQuery(req, "type");
  const days = getQueryInt(req, "days", 0); // 0 = all time, 1 = today
  const page = Math.max(1, getQueryInt(req, "page", 1));
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 10)));

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (type === "IN" || type === "OUT" || type === "ADJUST") where.type = type;
  if (days > 0) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0); // clinic timezone is UTC+0
    since.setUTCDate(since.getUTCDate() - (days - 1));
    where.createdAt = { gte: since };
  }
  if (search) {
    where.OR = [{ itemName: { contains: search, mode: "insensitive" } }, { reason: { contains: search, mode: "insensitive" } }];
  }

  const [rows, total, received, issued] = await Promise.all([
    db.stockMovement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.stockMovement.count({ where }),
    db.stockMovement.aggregate({ where: { ...where, change: { gt: 0 } }, _sum: { change: true } }),
    db.stockMovement.aggregate({ where: { ...where, change: { lt: 0 } }, _sum: { change: true } }),
  ]);

  return json({
    items: rows.map(serializeMovement),
    total, page, pageSize,
    stats: { count: total, unitsIn: received._sum.change ?? 0, unitsOut: -(issued._sum.change ?? 0) },
  });
});
