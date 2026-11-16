-- Default-deny lockdown of Supabase's auto-generated REST/GraphQL API.
-- The app talks to Postgres directly via Prisma (DB connection string), which
-- bypasses RLS. No policies are defined on purpose: RLS with zero policies
-- denies anon/authenticated, so a leaked anon key can't read or write anything.

ALTER TABLE "public"."Clinic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Patient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."EmergencyContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MedicalHistoryEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PatientConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PatientInsurance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PatientReferral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PackageDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PatientPackage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PackageTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InsuranceProvider" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InsuranceRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InsuranceClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TreatmentEpisode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Assessment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RomMeasurement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StrengthMeasurement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."FunctionalAssessmentItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Diagnosis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TreatmentPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PlanObjective" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."RehabilitationMilestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PlanIntervention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."TherapySession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SessionIntervention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProgressReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ReviewObjectiveResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Discharge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DischargeRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."InvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."FinancialTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StaffProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Setting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Counter" ENABLE ROW LEVEL SECURITY;
