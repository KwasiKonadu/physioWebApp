// ============ Server: REST API helpers — consistent responses & error handling ============
import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { db } from "@/lib/db";
import { AuditLog } from "@prisma/client";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { message: err.message, code: err.code } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const msg = first ? `${first.path.join(".") || "field"}: ${first.message}` : "Validation failed";
    return NextResponse.json({ error: { message: msg, code: "VALIDATION", details: err.issues } }, { status: 400 });
  }
  console.error("[API] Unhandled error:", err);
  return NextResponse.json({ error: { message: "Internal server error" } }, { status: 500 });
}

/** Wrap a route handler with centralized error handling. */
export function route(handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Parse + validate a JSON body with a Zod schema. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
  return schema.parse(body);
}

export function getQuery(req: Request, key: string): string | null {
  return new URL(req.url).searchParams.get(key);
}

export function getQueryInt(req: Request, key: string, fallback: number): number {
  const v = new URL(req.url).searchParams.get(key);
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

// ---- Audit logging ----
export async function audit(opts: {
  clinicId: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValues?: unknown;
  newValues?: unknown;
  reason?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        clinicId: opts.clinicId,
        userId: opts.userId || null,
        userName: opts.userName || null,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        previousValues: opts.previousValues ? JSON.stringify(opts.previousValues) : null,
        newValues: opts.newValues ? JSON.stringify(opts.newValues) : null,
        reason: opts.reason || null,
      },
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

// ---- Notifications ----
export async function notify(opts: {
  clinicId: string;
  userId?: string | null;
  audienceRole?: string | null;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}) {
  try {
    await db.notification.create({
      data: {
        clinicId: opts.clinicId,
        userId: opts.userId || null,
        audienceRole: opts.audienceRole || null,
        type: opts.type,
        title: opts.title,
        message: opts.message,
        entityType: opts.entityType || null,
        entityId: opts.entityId || null,
      },
    });
  } catch (e) {
    console.error("[notify] failed", e);
  }
}

// ---- Clinic settings helper ----
export async function getSetting(clinicId: string, key: string, fallback: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { clinicId_key: { clinicId, key } } });
  return row?.value ?? fallback;
}

export async function setSetting(clinicId: string, key: string, value: string) {
  await db.setting.upsert({
    where: { clinicId_key: { clinicId, key } },
    update: { value },
    create: { clinicId, key, value },
  });
}

/** Parse a JSON column safely. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
