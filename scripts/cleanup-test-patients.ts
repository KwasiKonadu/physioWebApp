/** One-off cleanup: remove leftover smoke-test patients (Okoro*) and their records. */
import { db } from "../src/lib/db";

async function main() {
  const victims = await db.patient.findMany({ where: { lastName: { startsWith: "Okoro" } }, select: { id: true, patientCode: true } });
  for (const p of victims) {
    await db.treatmentEpisode.deleteMany({ where: { patientId: p.id } });
    await db.emergencyContact.deleteMany({ where: { patientId: p.id } });
    await db.medicalHistoryEntry.deleteMany({ where: { patientId: p.id } });
    await db.patientConsent.deleteMany({ where: { patientId: p.id } });
    await db.patientReferral.deleteMany({ where: { patientId: p.id } });
    await db.patientInsurance.deleteMany({ where: { patientId: p.id } });
    await db.auditLog.deleteMany({ where: { entityId: p.id } });
    await db.notification.deleteMany({ where: { entityId: p.id } });
    await db.patient.delete({ where: { id: p.id } });
    console.log("removed", p.patientCode);
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
