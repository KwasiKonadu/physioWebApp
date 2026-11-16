// ============ Services catalogue: list + create ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit, requireAuth, parseJson,
} from "@/server/api-exports";
import { canManageCatalogue } from "./_perms";

const ARRANGEMENTS = ["PAYG", "PACKAGE", "INSURANCE"] as const;

const serviceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().nullable(),
  category: z.string().min(1).max(60).default("GENERAL"),
  standardPriceCents: z.number().int().min(0),
  defaultDurationMin: z.number().int().min(5).max(480).default(30),
  arrangements: z.array(z.enum(ARRANGEMENTS)).min(1).default(["PAYG"]),
  active: z.boolean().default(true),
});

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 50), 200);
  const active = getQuery(req, "active");
  const category = getQuery(req, "category");
  const search = getQuery(req, "search");

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;
  if (category) where.category = category;
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }];
  }

  const [items, total, categories] = await Promise.all([
    db.service.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.service.count({ where }),
    db.service.findMany({
      where: { clinicId: auth.clinicId },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    }),
  ]);

  return json({
    items: items.map((s) => ({ ...s, arrangements: parseJson<string[]>(s.arrangements, ["PAYG"]) })),
    total,
    page,
    pageSize,
    categories: categories.map((c) => c.category),
  });
});

export const POST = route(async (req) => {
  const auth = requireAuth(req);
  if (!canManageCatalogue(auth.permissions)) {
    throw new ApiError(403, "Missing permission: packages.manage or settings.manage");
  }
  const body = await parseBody(req, serviceSchema);

  const service = await db.service.create({
    data: {
      clinicId: auth.clinicId,
      name: body.name,
      description: body.description || null,
      category: body.category,
      standardPriceCents: body.standardPriceCents,
      defaultDurationMin: body.defaultDurationMin,
      arrangements: JSON.stringify(body.arrangements),
      active: body.active,
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "SERVICE_CREATED",
    entityType: "Service",
    entityId: service.id,
    newValues: { name: body.name, standardPriceCents: body.standardPriceCents, category: body.category },
  });

  return json({ service: { ...service, arrangements: parseJson<string[]>(service.arrangements, ["PAYG"]) } }, 201);
});
