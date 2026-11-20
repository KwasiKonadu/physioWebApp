import { requireAuth } from "@/server/auth";
import { route, json, parseBody, db } from "@/server/api-exports";
import { z } from "zod";

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const items = await db.notification.findMany({
    where: {
      clinicId: auth.clinicId,
      OR: [
        { userId: auth.userId },
        { userId: null, audienceRole: { in: ["ALL", auth.role.toUpperCase().replace(" ", "_")] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return json({ items });
});

export const PATCH = route(async (req) => {
  const auth = requireAuth(req);
  const body = await parseBody(req, z.object({ id: z.string().optional(), all: z.boolean().optional() }));
  if (body.all) {
    await db.notification.updateMany({
      where: { clinicId: auth.clinicId, userId: auth.userId, read: false },
      data: { read: true },
    });
  } else if (body.id) {
    // only this clinic's notifications, and only ones addressed to this user or to a role audience
    await db.notification.updateMany({
      where: { id: body.id, clinicId: auth.clinicId, OR: [{ userId: auth.userId }, { userId: null }] },
      data: { read: true },
    });
  }
  return json({ ok: true });
});
