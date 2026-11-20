// ============ Server: Auth (JWT-style HMAC tokens, scrypt password hashing) ============
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { ApiError } from "./api";
import { PERMS } from "@/lib/constants";

// Read lazily so `next build` doesn't need the secret; in production a missing secret is a hard error
// (a well-known fallback would let anyone forge tokens). The fallback only exists for local development.
function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  return "gmrs-dev-secret-change-in-production";
}
const ACCESS_TTL = 60 * 60 * 12; // 12h — demo friendly
const REFRESH_TTL = 60 * 60 * 24 * 7; // 7d

export interface TokenPayload {
  sub: string; // user id
  clinicId: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  type: "access" | "refresh";
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signToken(payload: Omit<TokenPayload, "exp">, ttlSec: number): string {
  const body: TokenPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const bodyStr = b64url(JSON.stringify(body));
  const sig = b64url(createHmac("sha256", getSecret()).update(`${head}.${bodyStr}`).digest());
  return `${head}.${bodyStr}.${sig}`;
}

export function verifyToken(token: string): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError(401, "Invalid token");
  const [head, bodyStr, sig] = parts;
  const expected = b64url(createHmac("sha256", getSecret()).update(`${head}.${bodyStr}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, "Invalid token signature");
  const payload = JSON.parse(fromB64url(bodyStr).toString()) as TokenPayload;
  if (payload.exp * 1000 < Date.now()) throw new ApiError(401, "Token expired");
  return payload;
}

// ---- Passwords (scrypt) ----
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ---- Auth context ----
export interface AuthUser {
  userId: string;
  clinicId: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

export function getAuth(req: Request): AuthUser {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new ApiError(401, "Not authenticated");
  const payload = verifyToken(token);
  if (payload.type !== "access") throw new ApiError(401, "Invalid token type");
  return {
    userId: payload.sub,
    clinicId: payload.clinicId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    permissions: payload.permissions || [],
  };
}

export function requireAuth(req: Request): AuthUser {
  return getAuth(req);
}

export function requirePermission(req: Request, permission: string): AuthUser {
  const user = getAuth(req);
  if (!user.permissions.includes(permission)) {
    throw new ApiError(403, `Missing permission: ${permission}`);
  }
  return user;
}

export function can(user: AuthUser | null | undefined, permission: string): boolean {
  return !!user && user.permissions.includes(permission);
}

// ---- Login / refresh ----
export async function login(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { role: true },
  });
  if (!user || !user.active) throw new ApiError(401, "Invalid email or password");
  if (!verifyPassword(password, user.passwordHash)) throw new ApiError(401, "Invalid email or password");
  const permissions = JSON.parse(user.role.permissions || "[]") as string[];
  const base = {
    sub: user.id, clinicId: user.clinicId, email: user.email, name: user.name,
    role: user.role.name, permissions,
  };
  const accessToken = signToken({ ...base, type: "access" }, ACCESS_TTL);
  const refreshToken = signToken({ ...base, type: "refresh" }, REFRESH_TTL);
  await db.refreshToken.create({
    data: { userId: user.id, token: refreshToken, expiresAt: new Date(Date.now() + REFRESH_TTL * 1000) },
  });
  return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role.name, permissions, clinicId: user.clinicId } };
}

export async function rotateRefreshToken(token: string) {
  const payload = verifyToken(token);
  if (payload.type !== "refresh") throw new ApiError(401, "Invalid refresh token");
  const stored = await db.refreshToken.findUnique({ where: { token } });
  if (!stored || stored.revoked) throw new ApiError(401, "Refresh token revoked");
  await db.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  const user = await db.user.findUnique({ where: { id: payload.sub }, include: { role: true } });
  if (!user || !user.active) throw new ApiError(401, "User inactive");
  const permissions = JSON.parse(user.role.permissions || "[]") as string[];
  const base = {
    sub: user.id, clinicId: user.clinicId, email: user.email, name: user.name,
    role: user.role.name, permissions,
  };
  const newRefresh = signToken({ ...base, type: "refresh" }, REFRESH_TTL);
  const accessToken = signToken({ ...base, type: "access" }, ACCESS_TTL);
  await db.refreshToken.create({
    data: { userId: user.id, token: newRefresh, expiresAt: new Date(Date.now() + REFRESH_TTL * 1000) },
  });
  return { accessToken, refreshToken: newRefresh };
}

export async function revokeAllTokens(userId: string) {
  await db.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
}
