// ============ Shared business-rule services (transaction-critical) ============
import { db } from "@/lib/db";
import { ApiError, audit, notify, parseJson } from "@/server/api";

// ---- Number sequences (atomic counter) ----
async function nextCounter(clinicId: string, key: string): Promise<number> {
  const c = await db.counter.upsert({
    where: { clinicId_key: { clinicId, key } },
    update: { value: { increment: 1 } },
    create: { clinicId, key, value: 1 },
  });
  return c.value;
}

export async function nextPatientCode(clinicId: string): Promise<string> {
  const n = await nextCounter(clinicId, "patientCode");
  return `PT-${String(n).padStart(6, "0")}`;
}

export async function nextStaffCode(clinicId: string): Promise<string> {
  const n = await nextCounter(clinicId, "staffCode");
  return `ST-${String(n).padStart(4, "0")}`;
}

export async function nextInvoiceNumber(clinicId: string): Promise<string> {
  const n = await nextCounter(clinicId, "invoiceNumber");
  return `INV-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

export async function nextClaimNumber(clinicId: string): Promise<string> {
  const n = await nextCounter(clinicId, "claimNumber");
  return `CLM-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
}

// ---- Tokenized patient search ----
// "Kofi Mensah" must match firstName=Kofi AND lastName=Mensah. Splitting the term into
// tokens and requiring every token to hit any searchable field makes both single-token
// and multi-token searches work consistently across modules (spec 6: searchable directory).
const PATIENT_TOKEN_FIELDS = ["firstName", "middleName", "lastName", "patientCode", "phone"] as const;

/** OR-group over patient fields for one token, optionally nested under a relation (e.g. "patient"). */
export function patientTokenOR(token: string, prefix?: string): Record<string, unknown> {
  const or = PATIENT_TOKEN_FIELDS.map((f) => ({ [f]: { contains: token, mode: "insensitive" } }));
  return prefix ? { [prefix]: { OR: or } } : { OR: or };
}

/** AND-clauses (one OR-group per token) for a search term on patient fields. */
export function patientSearchAnd(search: string, prefix?: string): Record<string, unknown>[] {
  return search.trim().split(/\s+/).filter(Boolean).map((t) => patientTokenOR(t, prefix));
}

/**
 * Generic tokenized search: every token must match ANY of `fields(token)`.
 * Use when the searchable surface spans multiple relations/fields.
 */
export function tokenizedSearchAnd(
  search: string,
  fields: (token: string) => Record<string, unknown>[],
): Record<string, unknown>[] {
  return search.trim().split(/\s+/).filter(Boolean).map((t) => ({ OR: fields(t) }));
}

// ---- Appointment conflict detection (Business Rule: no double-booking) ----
export async function findTherapistConflict(opts: {
  therapistId: string;
  date: Date;
  startMin: number;
  endMin: number;
  excludeAppointmentId?: string;
}) {
  const start = new Date(opts.date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const conflicts = await db.appointment.findMany({
    where: {
      therapistId: opts.therapistId,
      date: { gte: start, lt: end },
      status: { notIn: ["CANCELLED", "NO_SHOW", "RESCHEDULED"] },
      ...(opts.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      // overlap: existing.start < new.end && existing.end > new.start
      startMin: { lt: opts.endMin },
      endMin: { gt: opts.startMin },
    },
    include: { patient: { select: { firstName: true, lastName: true, patientCode: true } } },
  });
  return conflicts;
}

// ---- Package deduction (Business Rules 17/18: deduct only on qualifying completed session; auditable; idempotent) ----
type Tx = {
  patientPackage: {
    findMany: (args: { where: Record<string, unknown>; orderBy?: Record<string, string> }) => Promise<{ id: string; totalSessions: number; usedSessions: number }[]>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string; totalSessions: number; usedSessions: number }>;
  };
  packageTransaction: {
    findUnique: (args: { where: { sessionId_type: { sessionId: string; type: string } } }) => Promise<unknown>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

export async function deductPackageForSession(tx: Tx, opts: {
  clinicId: string;
  patientId: string;
  sessionId: string;
  performedById?: string;
}): Promise<{ deducted: boolean; patientPackageId?: string; remaining?: number }> {
  const list = await tx.patientPackage.findMany({
    where: { patientId: opts.patientId, status: "ACTIVE" },
    orderBy: { purchaseDate: "asc" },
  });
  const active = list.find((p: { usedSessions: number; totalSessions: number }) => p.usedSessions < p.totalSessions) || null;
  if (!active) return { deducted: false };

  // idempotency: never deduct twice for the same session
  const existing = await tx.packageTransaction.findUnique({
    where: { sessionId_type: { sessionId: opts.sessionId, type: "DEDUCTION" } },
  });
  if (existing) return { deducted: false, patientPackageId: active.id, remaining: active.totalSessions - active.usedSessions };

  const updated = await tx.patientPackage.update({
    where: { id: active.id },
    data: { usedSessions: { increment: 1 } },
  });
  await tx.packageTransaction.create({
    data: {
      patientPackageId: active.id,
      type: "DEDUCTION",
      sessions: -1,
      sessionId: opts.sessionId,
      description: "Session deduction for completed therapy session",
      performedById: opts.performedById || null,
    },
  });
  const remaining = updated.totalSessions - updated.usedSessions;
  if (remaining <= 0) {
    await tx.patientPackage.update({ where: { id: active.id }, data: { status: "EXHAUSTED" } });
    await tx.packageTransaction.create({
      data: {
        patientPackageId: active.id,
        type: "EXHAUSTED",
        sessions: 0,
        description: "Package exhausted",
        performedById: opts.performedById || null,
      },
    });
  }
  return { deducted: true, patientPackageId: active.id, remaining };
}

/**
 * Complete a therapy session inside a single transaction:
 * - marks session completed
 * - increments episode counters (total + since-review)
 * - evaluates progress-review threshold (default 15) and flags review due
 * - deducts a package session when the patient pays by package (Business Rule 17)
 * - notifies therapist
 */
export async function completeTherapySessionTx(opts: {
  sessionId: string;
  clinicId: string;
  userId: string;
  userName: string;
  updates: Record<string, unknown>;
}) {
  // NOTE: audit/notify run AFTER the transaction commits — they use the global Prisma
  // client, and issuing writes on a second connection from inside an open SQLite
  // transaction deadlocks until the tx times out (P2028). Business outcome is
  // identical: the audit row + notification are recorded once the completion is durable.
  const { session, episode, reviewDue, packageInfo, sessionsSinceReview, threshold, patientName } = await db.$transaction(async (tx) => {
    const txSession = await tx.therapySession.findUnique({
      where: { id: opts.sessionId },
      include: { episode: true, patient: { select: { firstName: true, lastName: true, paymentArrangement: true } } },
    });
    if (!txSession) throw new ApiError(404, "Therapy session not found");
    if (txSession.status === "COMPLETED") throw new ApiError(409, "Session is already completed");
    if (txSession.status === "CANCELLED" || txSession.status === "NO_SHOW") throw new ApiError(409, "Cannot complete a cancelled/no-show session");

    const txThreshold = txSession.episode.reviewThreshold || 15;

    const updated = await tx.therapySession.update({
      where: { id: opts.sessionId },
      data: {
        ...opts.updates,
        status: "COMPLETED",
        completedAt: new Date(),
      } as never,
    });

    const txEpisode = await tx.treatmentEpisode.update({
      where: { id: txSession.episodeId },
      data: {
        totalCompletedSessions: { increment: 1 },
        sessionsSinceReview: { increment: 1 },
        ...(txSession.episode.status === "AWAITING_PLAN" ? { status: "ACTIVE_TREATMENT" } : {}),
      },
    });

    let txReviewDue = false;
    if (!txEpisode.reviewDue && txEpisode.sessionsSinceReview >= txThreshold) {
      await tx.treatmentEpisode.update({ where: { id: txEpisode.id }, data: { reviewDue: true } });
      txReviewDue = true;
    }

    // Package deduction for qualifying completed session
    let txPackageInfo: { deducted: boolean; remaining?: number } = { deducted: false };
    if (txSession.patient.paymentArrangement === "PACKAGE") {
      txPackageInfo = await deductPackageForSession(tx as never, {
        clinicId: opts.clinicId,
        patientId: txSession.patientId,
        sessionId: txSession.id,
        performedById: opts.userId,
      });
    }

    return {
      session: updated,
      episode: txEpisode,
      reviewDue: txReviewDue,
      packageInfo: txPackageInfo,
      sessionsSinceReview: txEpisode.sessionsSinceReview,
      threshold: txThreshold,
      patientName: `${txSession.patient.firstName} ${txSession.patient.lastName}`,
    };
  });

  await audit({
    clinicId: opts.clinicId,
    userId: opts.userId,
    userName: opts.userName,
    action: "SESSION_COMPLETED",
    entityType: "TherapySession",
    entityId: session.id,
    newValues: { status: "COMPLETED", date: session.date },
  });

  if (reviewDue) {
    await notify({
      clinicId: opts.clinicId,
      userId: session.therapistId ? undefined : undefined,
      audienceRole: "PHYSIOTHERAPIST",
      type: "PROGRESS_REVIEW_DUE",
      title: "Progress review due",
      message: `${patientName} has completed ${threshold} sessions — progress review due.`,
      entityType: "TreatmentEpisode",
      entityId: episode.id,
    });
  }

  return { session, reviewDue, packageInfo, sessionsSinceReview, threshold };
}

// ---- Invoice totals recalculation (payments / refunds keep status consistent) ----
export async function recalcInvoiceStatus(invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true, refunds: true },
  });
  if (!invoice) throw new ApiError(404, "Invoice not found");
  const paid = invoice.payments.reduce((s, p) => s + p.amountCents, 0);
  const refunded = invoice.refunds.reduce((s, r) => s + r.amountCents, 0);
  const netPaid = paid - refunded;
  let status = invoice.status;
  if (invoice.status !== "CANCELLED" && invoice.status !== "DRAFT") {
    if (netPaid <= 0) status = "UNPAID";
    else if (netPaid >= invoice.totalCents) status = "PAID";
    else status = "PARTIAL";
  }
  return db.invoice.update({
    where: { id: invoiceId },
    data: { paidCents: netPaid, status },
  });
}

// ---- Patient current-status sync (episode is central workflow entity) ----
export async function syncPatientStatus(patientId: string) {
  const episodes = await db.treatmentEpisode.findMany({
    where: { patientId, status: { in: ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW"] } },
    orderBy: { openedDate: "desc" },
  });
  let status = "NO_EPISODE";
  let therapistId: string | null = null;
  if (episodes.length > 0) {
    status = episodes[0].status === "ACTIVE_TREATMENT" ? "IN_TREATMENT" : episodes[0].status;
    therapistId = episodes[0].therapistId;
  } else {
    const discharged = await db.treatmentEpisode.findFirst({ where: { patientId, status: "DISCHARGED" } });
    if (discharged) status = "DISCHARGED";
  }
  await db.patient.update({ where: { id: patientId }, data: { currentStatus: status, assignedTherapistId: therapistId } });
  return status;
}

// ---- Progress review completion (counter reset — Business Rule 9) ----
// NOTE: audit/notify run AFTER the transaction — a global-db write inside an interactive
// transaction deadlocks on SQLite (single writer) and forces the tx to time out (P2028).
export async function completeProgressReviewTx(opts: {
  reviewId: string;
  clinicId: string;
  userId: string;
  userName: string;
  updates: Record<string, unknown>;
  objectiveResults?: { objectiveId: string; objectiveDescription: string; baseline?: string; target?: string; current?: string; result: string; notes?: string }[];
}) {
  const result = await db.$transaction(async (tx) => {
    const review = await tx.progressReview.findUnique({
      where: { id: opts.reviewId },
      include: { episode: true, plan: true },
    });
    if (!review) throw new ApiError(404, "Progress review not found");
    if (review.status === "COMPLETED") throw new ApiError(409, "Review already completed");

    const updated = await tx.progressReview.update({
      where: { id: opts.reviewId },
      data: { ...opts.updates, status: "COMPLETED", completedAt: new Date() } as never,
    });

    if (opts.objectiveResults?.length) {
      for (const r of opts.objectiveResults) {
        await tx.reviewObjectiveResult.create({ data: { ...r, reviewId: review.id } as never });
        await tx.planObjective.update({ where: { id: r.objectiveId }, data: { status: r.result, notes: r.notes } as never });
      }
    }

    // Reset the review cycle counter (Business Rule 9)
    const episode = await tx.treatmentEpisode.update({
      where: { id: review.episodeId },
      data: { sessionsSinceReview: 0, reviewDue: false, status: review.decision === "DISCHARGE" ? "UNDER_REVIEW" : "ACTIVE_TREATMENT" },
    });

    return { review: updated, episode };
  });

  await audit({
    clinicId: opts.clinicId,
    userId: opts.userId,
    userName: opts.userName,
    action: "REVIEW_COMPLETED",
    entityType: "ProgressReview",
    entityId: opts.reviewId,
    newValues: { decision: opts.updates.decision },
  });

  return result;
}

// ---- Discharge completion (Business Rule 15: closes episode, not patient) ----
// NOTE: audit runs AFTER the transaction — a global-db write inside an interactive
// transaction deadlocks on SQLite (single writer) and forces the tx to time out (P2028).
export async function completeDischargeTx(opts: {
  dischargeId: string;
  clinicId: string;
  userId: string;
  userName: string;
  updates: Record<string, unknown>;
}) {
  const result = await db.$transaction(async (tx) => {
    const discharge = await tx.discharge.findUnique({
      where: { id: opts.dischargeId },
      include: { episode: true },
    });
    if (!discharge) throw new ApiError(404, "Discharge record not found");
    if (discharge.status === "COMPLETED") throw new ApiError(409, "Discharge already completed");

    const updated = await tx.discharge.update({
      where: { id: opts.dischargeId },
      data: { ...opts.updates, status: "COMPLETED", completedAt: new Date() } as never,
    });

    await tx.treatmentEpisode.update({
      where: { id: discharge.episodeId },
      data: { status: "DISCHARGED", closedDate: new Date() },
    });

    return { discharge: updated, reason: discharge.reason };
  });

  // Note: outstanding payments intentionally do NOT block discharge (Business Rule 16)
  await audit({
    clinicId: opts.clinicId,
    userId: opts.userId,
    userName: opts.userName,
    action: "EPISODE_DISCHARGED",
    entityType: "Discharge",
    entityId: opts.dischargeId,
    newValues: { reason: result.reason },
  });

  return { discharge: result.discharge };
}
