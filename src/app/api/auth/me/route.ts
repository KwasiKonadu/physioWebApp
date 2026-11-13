import { requireAuth } from "@/server/auth";
import { route, json, ApiError } from "@/server/api";
import { db } from "@/lib/db";

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    include: { role: true },
  });
  if (!user || !user.active) throw new ApiError(401, "User not found");
  return json({
    user: {
      id: user.id, email: user.email, name: user.name,
      role: user.role.name, permissions: JSON.parse(user.role.permissions),
      clinicId: user.clinicId,
    },
  });
});
