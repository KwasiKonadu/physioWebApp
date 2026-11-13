import { rotateRefreshToken } from "@/server/auth";
import { route, json } from "@/server/api";

export const POST = route(async (req) => {
  const { refreshToken } = await req.json();
  if (!refreshToken) return json({ error: { message: "refreshToken required" } }, 400);
  const result = await rotateRefreshToken(refreshToken);
  return json(result);
});
