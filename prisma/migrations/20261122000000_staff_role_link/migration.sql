-- Link staff to a Role (source of truth for the staff role dropdown). Additive: "staffRole" is kept.
ALTER TABLE "StaffProfile" ADD COLUMN "roleId" TEXT;

CREATE INDEX "StaffProfile_roleId_idx" ON "StaffProfile"("roleId");

ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ensure every clinic has the built-in Physiotherapist system role (deployed DBs may only have the admin role)
INSERT INTO "Role" ("id", "clinicId", "name", "description", "permissions", "system")
SELECT 'role_' || substr(md5(random()::text || c."id"), 1, 24), c."id", 'Physiotherapist',
       'Clinical care for assigned patients',
       '["dashboard.view","patients.view","appointments.view","appointments.manage","clinical.view","clinical.manage","reports.view","leave.apply"]',
       true
FROM "Clinic" c
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."clinicId" = c."id" AND r."name" = 'Physiotherapist');

-- Backfill from the existing staffRole code using each clinic's role of the matching name
UPDATE "StaffProfile" sp
SET "roleId" = r."id"
FROM "Role" r
WHERE r."clinicId" = sp."clinicId"
  AND r."name" = CASE sp."staffRole"
    WHEN 'ADMIN' THEN 'Clinic Administrator'
    WHEN 'RECEPTIONIST' THEN 'Receptionist'
    WHEN 'PHYSIOTHERAPIST' THEN 'Physiotherapist'
    WHEN 'MANAGEMENT' THEN 'Management'
  END;
