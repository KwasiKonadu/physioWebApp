// Idempotent: creates (or updates) a clinic administrator. Never deletes data.
// Usage: tsx prisma/create-admin.ts <email> <password> [name]
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

const ALL_PERMS = [
  "dashboard.view", "patients.view", "patients.manage", "appointments.view", "appointments.manage",
  "clinical.view", "clinical.manage", "billing.view", "billing.manage", "billing.refund",
  "packages.manage", "insurance.manage", "staff.view", "staff.manage", "reports.view", "settings.manage",
];

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function main() {
  const [email, password, name = "Administrator"] = process.argv.slice(2);
  if (!email || !password) throw new Error("Usage: create-admin.ts <email> <password> [name]");

  const clinic = await db.clinic.upsert({
    where: { code: "GMRS" },
    update: {},
    create: { name: "GMRS Physiotherapy & Rehab Clinic", code: "GMRS" },
  });

  if ((await db.branch.count({ where: { clinicId: clinic.id } })) === 0) {
    await db.branch.create({ data: { clinicId: clinic.id, name: "Main Clinic" } });
  }

  const role = await db.role.upsert({
    where: { clinicId_name: { clinicId: clinic.id, name: "Clinic Administrator" } },
    update: { permissions: JSON.stringify(ALL_PERMS) },
    create: {
      clinicId: clinic.id, name: "Clinic Administrator",
      description: "Full access to clinic configuration, staff and records",
      permissions: JSON.stringify(ALL_PERMS), system: true,
    },
  });

  const normalized = email.trim().toLowerCase();
  const user = await db.user.upsert({
    where: { email: normalized },
    update: { passwordHash: hashPassword(password), roleId: role.id, active: true },
    create: { clinicId: clinic.id, email: normalized, passwordHash: hashPassword(password), name, roleId: role.id },
  });

  console.log(`Admin ready: ${user.email} (clinic ${clinic.code}, role ${role.name})`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
