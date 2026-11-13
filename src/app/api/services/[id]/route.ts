// ============ Service detail: get + update (never delete; active=false deactivates) ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requireAuth, parseJson } from "@/server/api-exports";
import { canManageCatalogue } from "../_perms";

const ARRANGEMENTS = ["PAYG", "PACKAGE", "INSURANCE"] as const;

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).optional().nullable(),
  category: z.string().min(1).max(60).optional(),
  standardPriceCents: z.number().int().min(0).optional(),
  defaultDurationMin: z.number().int().min(5).max(480).optional(),
  arrangements: z.array(z.enum(ARRANGEMENTS)).min(1).optional(),
  active: z.boolean().optional(),
});

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const service = await db.service.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!service) throw new ApiError(404, "Service not found");
  return json({ service: { ...service, arrangements: parseJson<string[]>(service.arrangements, ["PAYG"]) } });
});

export const PATCH = route(async (req, ctx) => {
  const auth = requireAuth(req);
  if (!canManageCatalogue(auth.permissions)) {
    throw new ApiError(403, "Missing permission: packages.manage or settings.manage");
  }
  const { id } = await ctx.params;
  const existing = await db.service.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!existing) throw new ApiError(404, "Service not found");

  const body = await parseBody(req, updateSchema);
  const service = await db.service.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description || null } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.standardPriceCents !== undefined ? { standardPriceCents: body.standardPriceCents } : {}),
      ...(body.defaultDurationMin !== undefined ? { defaultDurationMin: body.defaultDurationMin } : {}),
      ...(body.arrangements !== undefined ? { arrangements: JSON.stringify(body.arrangements) } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "SERVICE_UPDATED",
    entityType: "Service",
    entityId: id,
    previousValues: { name: existing.name, standardPriceCents: existing.standardPriceCents, active: existing.active },
    newValues: { name: service.name, standardPriceCents: service.standardPriceCents, active: service.active },
  });

  return json({ service: { ...service, arrangements: parseJson<string[]>(service.arrangements, ["PAYG"]) } });
});
