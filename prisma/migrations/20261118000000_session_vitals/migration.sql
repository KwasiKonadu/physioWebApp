-- AlterTable
ALTER TABLE "TherapySession" ADD COLUMN "painLevelEnd" INTEGER;

-- CreateTable
CREATE TABLE "SessionVital" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'START',
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionVital_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SessionVital_sessionId_idx" ON "SessionVital"("sessionId");
ALTER TABLE "SessionVital" ADD CONSTRAINT "SessionVital_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TherapySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."SessionVital" ENABLE ROW LEVEL SECURITY;

-- Carry existing data over as START-of-session vitals
INSERT INTO "SessionVital" ("id","sessionId","phase","name","value","unit")
SELECT 'sv_bp_' || "id", "id", 'START', 'Blood pressure', "bloodPressure", 'mmHg' FROM "TherapySession" WHERE "bloodPressure" IS NOT NULL AND "bloodPressure" <> '';
INSERT INTO "SessionVital" ("id","sessionId","phase","name","value","unit")
SELECT 'sv_hr_' || "id", "id", 'START', 'Heart rate', "heartRate"::text, 'bpm' FROM "TherapySession" WHERE "heartRate" IS NOT NULL;
INSERT INTO "SessionVital" ("id","sessionId","phase","name","value","unit")
SELECT 'sv_ot_' || "id", "id", 'START', 'Other', "otherVitals", NULL FROM "TherapySession" WHERE "otherVitals" IS NOT NULL AND "otherVitals" <> '';

-- AlterTable
ALTER TABLE "TherapySession" DROP COLUMN "bloodPressure", DROP COLUMN "heartRate", DROP COLUMN "otherVitals";
