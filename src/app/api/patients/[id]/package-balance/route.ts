// GET /api/patients/[id]/package-balance — remaining sessions + warning state (also sweeps expired packages)
import { route, json, ApiError, requireAuth } from "@/server/api-exports";
import { getPackageBalance } from "@/server/services/package-balance";

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const balance = await getPackageBalance(auth.clinicId, id);
  if (!balance) throw new ApiError(404, "Patient not found");
  return json(balance);
});
