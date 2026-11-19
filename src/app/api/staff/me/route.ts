// ============ API: the logged-in user's own staff profile id ============
import { route, json, requireAuth } from "@/server/api-exports";
import { staffIdForUser } from "@/server/leave";

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  return json({ staffId: await staffIdForUser(auth.userId) });
});
