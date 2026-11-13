import { login } from "@/server/auth";
import { route, json } from "@/server/api";

export const POST = route(async (req) => {
  const { email, password } = await req.json();
  if (!email || !password) {
    return json({ error: { message: "Email and password are required" } }, 400);
  }
  const result = await login(email, password);
  return json(result);
});
