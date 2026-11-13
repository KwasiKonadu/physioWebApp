// ============ Provider service rates: list + upsert (unique [providerId, serviceId]) ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const provider = await db.insuranceProvider.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!provider) throw new ApiError(404, "Insurance provider not found");

  const rates = await db.insuranceRate.findMany({
    where: { providerId: id },
    include: { service: { select: { id: true, name: true, standardPriceCents: true, category: true, active: true } } },
    orderBy: [{ service: { category: "asc" } }, { service: { name: "asc" } }],
  });
  return json({ items: rates });
});

const rateSchema = z.object({
  serviceId: z.string().min(1),
  rateCents: z.number().int().min(0),
  coveragePercent: z.number().int().min(0).max(100),
});

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.insuranceManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, rateSchema);

  const provider = await db.insuranceProvider.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!provider) throw new ApiError(404, "Insurance provider not found");
  const service = await db.service.findFirst({ where: { id: body.serviceId, clinicId: auth.clinicId } });
  if (!service) throw new ApiError(404, "Service not found");

  const existing = await db.insuranceRate.findUnique({
    where: { providerId_serviceId: { providerId: id, serviceId: body.serviceId } },
  });

  const rate = await db.insuranceRate.upsert({
    where: { providerId_serviceId: { providerId: id, serviceId: body.serviceId } },
    update: { rateCents: body.rateCents, coveragePercent: body.coveragePercent, active: true },
    create: { providerId: id, serviceId: body.serviceId, rateCents: body.rateCents, coveragePercent: body.coveragePercent },
    include: { service: { select: { id: true, name: true, standardPriceCents: true, category: true, active: true } } },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "INSURANCE_RATE_UPDATED",
    entityType: "InsuranceRate",
    entityId: rate.id,
    previousValues: existing ? { serviceId: body.serviceId, rateCents: existing.rateCents, coveragePercent: existing.coveragePercent } : null,
    newValues: { serviceId: body.serviceId, rateCents: body.rateCents, coveragePercent: body.coveragePercent },
  });

  return json({ rate }, existing ? 200 : 201);
});
