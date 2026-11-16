// ============ Package definitions: list + create ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit, requireAuth, parseJson,
} from "@/server/api-exports";
import { canManageCatalogue } from "../services/_perms";

const packageSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
  sessions: z.number().int().min(1).max(500),
  priceCents: z.number().int().min(0),
  validityDays: z.number().int().min(1).max(3650),
  serviceIds: z.array(z.string().min(1)).default([]),
  active: z.boolean().default(true),
});

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 50), 200);
  const active = getQuery(req, "active");
  const search = getQuery(req, "search");

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }];
  }

  const [items, total] = await Promise.all([
    db.packageDefinition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { patientPackages: true } } },
    }),
    db.packageDefinition.count({ where }),
  ]);

  return json({
    items: items.map((p) => ({ ...p, serviceIds: parseJson<string[]>(p.serviceIds, []) })),
    total,
    page,
    pageSize,
  });
});

export const POST = route(async (req) => {
  const auth = requireAuth(req);
  if (!canManageCatalogue(auth.permissions)) {
    throw new ApiError(403, "Missing permission: packages.manage or settings.manage");
  }
  const body = await parseBody(req, packageSchema);

  const pkg = await db.packageDefinition.create({
    data: {
      clinicId: auth.clinicId,
      name: body.name,
      description: body.description || null,
      sessions: body.sessions,
      priceCents: body.priceCents,
      validityDays: body.validityDays,
      serviceIds: JSON.stringify(body.serviceIds),
      active: body.active,
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PACKAGE_CREATED",
    entityType: "PackageDefinition",
    entityId: pkg.id,
    newValues: { name: body.name, sessions: body.sessions, priceCents: body.priceCents, validityDays: body.validityDays },
  });

  return json({ package: { ...pkg, serviceIds: body.serviceIds, _count: { patientPackages: 0 } } }, 201);
});
