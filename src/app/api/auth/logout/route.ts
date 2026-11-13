import { route, json } from "@/server/api-exports";

export const POST = route(async () => {
  // Client clears its tokens; refresh tokens are revoked lazily by rotation.
  return json({ ok: true });
});
