// ============ Package balance + automatic expiry (warning-only; never blocks booking) ============
import { db } from "@/lib/db";
import { notify } from "@/server/api";

const LOW_THRESHOLD = 2;
const EXPIRING_DAYS = 14;

/** Marks ACTIVE packages past their expiry date as EXPIRED (+ ledger entry + notification). Idempotent. */
export async function expireDuePackages(clinicId: string, patientId?: string): Promise<number> {
  const due = await db.patientPackage.findMany({
    where: { clinicId, status: "ACTIVE", expiryDate: { lt: new Date() }, ...(patientId ? { patientId } : {}) },
    include: { package: { select: { name: true } }, patient: { select: { firstName: true, lastName: true } } },
  });
  let count = 0;
  for (const pp of due) {
    // status guard keeps this safe if two requests race
    const res = await db.patientPackage.updateMany({ where: { id: pp.id, status: "ACTIVE" }, data: { status: "EXPIRED" } });
    if (res.count === 0) continue;
    count++;
    const remaining = pp.totalSessions - pp.usedSessions;
    await db.packageTransaction.create({
      data: {
        patientPackageId: pp.id, type: "EXPIRY", sessions: -Math.max(0, remaining),
        description: `Package expired — ${pp.package.name} (${Math.max(0, remaining)} unused session(s))`,
      },
    });
    await notify({
      clinicId, audienceRole: "RECEPTIONIST", type: "PACKAGE_EXPIRED", title: "Package expired",
      message: `${pp.patient.firstName} ${pp.patient.lastName}'s ${pp.package.name} expired with ${Math.max(0, remaining)} unused session(s).`,
      entityType: "PatientPackage", entityId: pp.id,
    });
  }
  return count;
}

export type PackageBalanceState = "OK" | "LOW" | "EXPIRING" | "EXHAUSTED" | "EXPIRED" | "NONE";

export async function getPackageBalance(clinicId: string, patientId: string) {
  await expireDuePackages(clinicId, patientId);
  const patient = await db.patient.findFirst({ where: { id: patientId, clinicId }, select: { paymentArrangement: true } });
  if (!patient) return null;
  const packages = await db.patientPackage.findMany({
    where: { clinicId, patientId },
    orderBy: { expiryDate: "asc" },
    include: { package: { select: { name: true } } },
  });
  const usable = packages.filter((p) => p.status === "ACTIVE" && p.usedSessions < p.totalSessions);
  const remaining = usable.reduce((n, p) => n + (p.totalSessions - p.usedSessions), 0);
  const nextExpiry = usable[0]?.expiryDate ?? null;

  let state: PackageBalanceState = "OK";
  if (!usable.length) {
    state = !packages.length ? "NONE" : packages.some((p) => p.status === "EXPIRED") && !packages.some((p) => p.status === "EXHAUSTED") ? "EXPIRED" : "EXHAUSTED";
  } else if (remaining <= LOW_THRESHOLD) {
    state = "LOW";
  } else if (nextExpiry && nextExpiry.getTime() - Date.now() <= EXPIRING_DAYS * 86_400_000) {
    state = "EXPIRING";
  }
  return {
    arrangement: patient.paymentArrangement,
    state, remaining, nextExpiry,
    packageName: usable[0]?.package.name ?? null,
  };
}
