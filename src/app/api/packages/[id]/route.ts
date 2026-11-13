// ============ Package definition detail: get + update (never delete; active=false deactivates) ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requireAuth, parseJson } from "@/server/api-exports";
import { canManageCatalogue } from "../../services/_perms";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  sessions: z.number().int().min(1).max(500).optional(),
  priceCents: z.number().int().min(0).optional(),
  validityDays: z.number().int().min(1).max(3650).optional(),
  serviceIds: z.array(z.string().min(1)).optional(),
  active: z.boolean().optional(),
});

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const pkg = await db.packageDefinition.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { _count: { select: { patientPackages: true } } },
  });
  if (!pkg) throw new ApiError(404, "Package not found");

  const serviceIds = parseJson<string[]>(pkg.serviceIds, []);
  const services = serviceIds.length
    ? await db.service.findMany({ where: { id: { in: serviceIds }, clinicId: auth.clinicId }, select: { id: true, name: true, standardPriceCents: true } })
    : [];

  return json({ package: { ...pkg, serviceIds, services } });
});

export const PATCH = route(async (req, ctx) => {
  const auth = requireAuth(req);
  if (!canManageCatalogue(auth.permissions)) {
    throw new ApiError(403, "Missing permission: packages.manage or settings.manage");
  }
  const { id } = await ctx.params;
  const existing = await db.packageDefinition.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!existing) throw new ApiError(404, "Package not found");

  const body = await parseBody(req, updateSchema);
  const pkg = await db.packageDefinition.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.sessions !== undefined ? { sessions: body.sessions } : {}),
      ...(body.priceCents !== undefined ? { priceCents: body.priceCents } : {}),
      ...(body.validityDays !== undefined ? { validityDays: body.validityDays } : {}),
      ...(body.serviceIds !== undefined ? { serviceIds: JSON.stringify(body.serviceIds) } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
    include: { _count: { select: { patientPackages: true } } },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PACKAGE_UPDATED",
    entityType: "PackageDefinition",
    entityId: id,
    previousValues: { name: existing.name, priceCents: existing.priceCents, sessions: existing.sessions, active: existing.active },
    newValues: { name: pkg.name, priceCents: pkg.priceCents, sessions: pkg.sessions, active: pkg.active },
  });

  return json({ package: { ...pkg, serviceIds: parseJson<string[]>(pkg.serviceIds, []) } });
});
