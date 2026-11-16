-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Accra',
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "staffId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "occupation" TEXT,
    "maritalStatus" TEXT,
    "nationality" TEXT,
    "photoUrl" TEXT,
    "paymentArrangement" TEXT NOT NULL DEFAULT 'PAYG',
    "currentStatus" TEXT NOT NULL DEFAULT 'NO_EPISODE',
    "assignedTherapistId" TEXT,
    "registeredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "address" TEXT,
    "isNextOfKin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalHistoryEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "MedicalHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientConsent" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "treatmentConsent" BOOLEAN NOT NULL DEFAULT false,
    "dataConsent" BOOLEAN NOT NULL DEFAULT false,
    "signatureName" TEXT,
    "consentDate" TIMESTAMP(3),
    "guardianName" TEXT,
    "guardianRelationship" TEXT,
    "documentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientInsurance" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "membershipNumber" TEXT NOT NULL,
    "policyNumber" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "principalMember" TEXT,
    "relationshipToPrincipal" TEXT,
    "documentRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientReferral" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "referrerName" TEXT,
    "referrerContact" TEXT,
    "referralDate" TIMESTAMP(3),
    "letterRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "standardPriceCents" INTEGER NOT NULL,
    "defaultDurationMin" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "arrangements" TEXT NOT NULL DEFAULT '["PAYG"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageDefinition" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sessions" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "serviceIds" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientPackage" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "totalSessions" INTEGER NOT NULL,
    "usedSessions" INTEGER NOT NULL DEFAULT 0,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "PatientPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageTransaction" (
    "id" TEXT NOT NULL,
    "patientPackageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "sessionId" TEXT,
    "amountCents" INTEGER,
    "description" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceProvider" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "email" TEXT,
    "billingArrangement" TEXT NOT NULL DEFAULT 'DIRECT_BILLING',
    "coveragePercent" INTEGER NOT NULL DEFAULT 80,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InsuranceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceRate" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "rateCents" INTEGER NOT NULL,
    "coveragePercent" INTEGER NOT NULL DEFAULT 80,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InsuranceRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "claimedCents" INTEGER NOT NULL,
    "approvedCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submittedDate" TIMESTAMP(3),
    "decisionDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentEpisode" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "holdHistory" TEXT NOT NULL DEFAULT '[]',
    "openedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'AWAITING_ASSESSMENT',
    "therapistId" TEXT,
    "branchId" TEXT,
    "totalCompletedSessions" INTEGER NOT NULL DEFAULT 0,
    "sessionsSinceReview" INTEGER NOT NULL DEFAULT 0,
    "reviewThreshold" INTEGER NOT NULL DEFAULT 15,
    "reviewDue" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "assessmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "primaryComplaint" TEXT,
    "bodyPart" TEXT,
    "affectedSide" TEXT,
    "duration" TEXT,
    "onset" TEXT,
    "cause" TEXT,
    "aggravating" TEXT,
    "relieving" TEXT,
    "previousTreatment" TEXT,
    "additionalHistory" TEXT,
    "painCurrent" INTEGER,
    "painWorst" INTEGER,
    "painLowest" INTEGER,
    "painLocation" TEXT,
    "painType" TEXT,
    "painFrequency" TEXT,
    "painNotes" TEXT,
    "posture" TEXT,
    "swelling" TEXT,
    "deformity" TEXT,
    "skinCondition" TEXT,
    "muscleWasting" TEXT,
    "gait" TEXT,
    "bloodPressure" TEXT,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "temperature" DOUBLE PRECISION,
    "oxygenSaturation" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "clinicalFindings" TEXT,
    "impairments" TEXT,
    "functionalLimitations" TEXT,
    "clinicalImpression" TEXT,
    "precautions" TEXT,
    "additionalNotes" TEXT,
    "therapistSignature" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomMeasurement" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "movement" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "activeRom" DOUBLE PRECISION,
    "passiveRom" DOUBLE PRECISION,
    "normalValue" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "RomMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrengthMeasurement" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "StrengthMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunctionalAssessmentItem" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "FunctionalAssessmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bodyPart" TEXT,
    "affectedSide" TEXT,
    "severity" TEXT,
    "explanation" TEXT,
    "provisional" BOOLEAN NOT NULL DEFAULT false,
    "diagnosisDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "therapistId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "changeHistory" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentPlan" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sessionsPerWeek" INTEGER,
    "expectedTotalSessions" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "sessionDurationMin" INTEGER,
    "reviewThresholdSessions" INTEGER NOT NULL DEFAULT 15,
    "contraindications" TEXT,
    "restrictions" TEXT,
    "activitiesToAvoid" TEXT,
    "specialPrecautions" TEXT,
    "patientRecommendations" TEXT,
    "referralInstructions" TEXT,
    "activatedAt" TIMESTAMP(3),
    "revisedFromId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanObjective" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "baseline" TEXT,
    "target" TEXT,
    "unit" TEXT,
    "priority" TEXT,
    "expectedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "PlanObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RehabilitationMilestone" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectiveId" TEXT,
    "expectedDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "RehabilitationMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanIntervention" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "notes" TEXT,

    CONSTRAINT "PlanIntervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "branchId" TEXT,
    "patientId" TEXT NOT NULL,
    "episodeId" TEXT,
    "therapistId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "purpose" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "walkIn" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapySession" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "timeMin" INTEGER,
    "durationMin" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "painLevel" INTEGER,
    "bloodPressure" TEXT,
    "heartRate" INTEGER,
    "otherVitals" TEXT,
    "patientResponse" TEXT,
    "observations" TEXT,
    "notes" TEXT,
    "therapistSignature" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionIntervention" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "SessionIntervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressReview" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "planId" TEXT,
    "triggerSessions" INTEGER NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "painCurrent" INTEGER,
    "painWorst" INTEGER,
    "romSummary" TEXT,
    "strengthSummary" TEXT,
    "functionalSummary" TEXT,
    "vitals" TEXT,
    "newFindings" TEXT,
    "comparison" TEXT NOT NULL DEFAULT '[]',
    "improvements" TEXT,
    "deterioration" TEXT,
    "patientResponse" TEXT,
    "observations" TEXT,
    "recommendations" TEXT,
    "decision" TEXT,
    "decisionNotes" TEXT,
    "newPlanId" TEXT,
    "therapistSignature" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewObjectiveResult" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "objectiveDescription" TEXT NOT NULL,
    "baseline" TEXT,
    "target" TEXT,
    "current" TEXT,
    "result" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ReviewObjectiveResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discharge" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "dischargeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT NOT NULL,
    "finalAssessment" TEXT,
    "baselineComparison" TEXT NOT NULL DEFAULT '[]',
    "objectiveOutcomes" TEXT,
    "remainingLimitations" TEXT,
    "summary" TEXT,
    "followUpType" TEXT,
    "followUpDetails" TEXT,
    "therapistSignature" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DischargeRecommendation" (
    "id" TEXT NOT NULL,
    "dischargeId" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "instructions" TEXT,
    "frequency" TEXT,
    "duration" TEXT,
    "repetitions" TEXT,
    "precautions" TEXT,
    "notes" TEXT,

    CONSTRAINT "DischargeRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "episodeId" TEXT,
    "arrangement" TEXT NOT NULL DEFAULT 'PAYG',
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "insuranceCoveredCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "serviceId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "appliedRateCents" INTEGER,
    "coveragePercent" INTEGER,
    "coveredCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "description" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "branchId" TEXT,
    "staffCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT NOT NULL,
    "department" TEXT,
    "staffRole" TEXT NOT NULL,
    "employmentDate" TIMESTAMP(3),
    "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "professionalDesignation" TEXT,
    "specialization" TEXT,
    "qualifications" TEXT,
    "availability" TEXT,
    "remunerationMethod" TEXT NOT NULL DEFAULT 'FIXED',
    "remunerationRateCents" INTEGER,
    "isTherapist" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT,
    "audienceRole" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValues" TEXT,
    "newValues" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_code_key" ON "Clinic"("code");

-- CreateIndex
CREATE INDEX "Branch_clinicId_idx" ON "Branch"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clinicId_idx" ON "User"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_clinicId_name_key" ON "Role"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_patientCode_key" ON "Patient"("patientCode");

-- CreateIndex
CREATE INDEX "Patient_clinicId_lastName_idx" ON "Patient"("clinicId", "lastName");

-- CreateIndex
CREATE INDEX "Patient_clinicId_phone_idx" ON "Patient"("clinicId", "phone");

-- CreateIndex
CREATE INDEX "Patient_clinicId_currentStatus_idx" ON "Patient"("clinicId", "currentStatus");

-- CreateIndex
CREATE INDEX "EmergencyContact_patientId_idx" ON "EmergencyContact"("patientId");

-- CreateIndex
CREATE INDEX "MedicalHistoryEntry_patientId_type_idx" ON "MedicalHistoryEntry"("patientId", "type");

-- CreateIndex
CREATE INDEX "PatientInsurance_patientId_idx" ON "PatientInsurance"("patientId");

-- CreateIndex
CREATE INDEX "PatientReferral_patientId_idx" ON "PatientReferral"("patientId");

-- CreateIndex
CREATE INDEX "Service_clinicId_idx" ON "Service"("clinicId");

-- CreateIndex
CREATE INDEX "PackageDefinition_clinicId_idx" ON "PackageDefinition"("clinicId");

-- CreateIndex
CREATE INDEX "PatientPackage_patientId_status_idx" ON "PatientPackage"("patientId", "status");

-- CreateIndex
CREATE INDEX "PatientPackage_clinicId_idx" ON "PatientPackage"("clinicId");

-- CreateIndex
CREATE INDEX "PackageTransaction_patientPackageId_idx" ON "PackageTransaction"("patientPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageTransaction_sessionId_type_key" ON "PackageTransaction"("sessionId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceProvider_clinicId_code_key" ON "InsuranceProvider"("clinicId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceRate_providerId_serviceId_key" ON "InsuranceRate"("providerId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_invoiceId_key" ON "InsuranceClaim"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_claimNumber_key" ON "InsuranceClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "InsuranceClaim_providerId_status_idx" ON "InsuranceClaim"("providerId", "status");

-- CreateIndex
CREATE INDEX "TreatmentEpisode_clinicId_status_idx" ON "TreatmentEpisode"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentEpisode_patientId_episodeNumber_key" ON "TreatmentEpisode"("patientId", "episodeNumber");

-- CreateIndex
CREATE INDEX "Assessment_episodeId_idx" ON "Assessment"("episodeId");

-- CreateIndex
CREATE INDEX "RomMeasurement_assessmentId_idx" ON "RomMeasurement"("assessmentId");

-- CreateIndex
CREATE INDEX "StrengthMeasurement_assessmentId_idx" ON "StrengthMeasurement"("assessmentId");

-- CreateIndex
CREATE INDEX "FunctionalAssessmentItem_assessmentId_idx" ON "FunctionalAssessmentItem"("assessmentId");

-- CreateIndex
CREATE INDEX "Diagnosis_episodeId_idx" ON "Diagnosis"("episodeId");

-- CreateIndex
CREATE INDEX "TreatmentPlan_clinicId_status_idx" ON "TreatmentPlan"("clinicId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentPlan_episodeId_version_key" ON "TreatmentPlan"("episodeId", "version");

-- CreateIndex
CREATE INDEX "PlanObjective_planId_idx" ON "PlanObjective"("planId");

-- CreateIndex
CREATE INDEX "RehabilitationMilestone_planId_idx" ON "RehabilitationMilestone"("planId");

-- CreateIndex
CREATE INDEX "PlanIntervention_planId_idx" ON "PlanIntervention"("planId");

-- CreateIndex
CREATE INDEX "Appointment_therapistId_date_status_idx" ON "Appointment"("therapistId", "date", "status");

-- CreateIndex
CREATE INDEX "Appointment_patientId_date_idx" ON "Appointment"("patientId", "date");

-- CreateIndex
CREATE INDEX "Appointment_clinicId_date_idx" ON "Appointment"("clinicId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TherapySession_appointmentId_key" ON "TherapySession"("appointmentId");

-- CreateIndex
CREATE INDEX "TherapySession_episodeId_status_idx" ON "TherapySession"("episodeId", "status");

-- CreateIndex
CREATE INDEX "TherapySession_patientId_idx" ON "TherapySession"("patientId");

-- CreateIndex
CREATE INDEX "SessionIntervention_sessionId_idx" ON "SessionIntervention"("sessionId");

-- CreateIndex
CREATE INDEX "ProgressReview_episodeId_status_idx" ON "ProgressReview"("episodeId", "status");

-- CreateIndex
CREATE INDEX "ReviewObjectiveResult_reviewId_idx" ON "ReviewObjectiveResult"("reviewId");

-- CreateIndex
CREATE INDEX "Discharge_episodeId_idx" ON "Discharge"("episodeId");

-- CreateIndex
CREATE INDEX "Discharge_patientId_idx" ON "Discharge"("patientId");

-- CreateIndex
CREATE INDEX "DischargeRecommendation_dischargeId_idx" ON "DischargeRecommendation"("dischargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_patientId_status_idx" ON "Invoice"("patientId", "status");

-- CreateIndex
CREATE INDEX "Invoice_clinicId_createdAt_idx" ON "Invoice"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Refund_invoiceId_idx" ON "Refund"("invoiceId");

-- CreateIndex
CREATE INDEX "FinancialTransaction_clinicId_type_createdAt_idx" ON "FinancialTransaction"("clinicId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_staffCode_key" ON "StaffProfile"("staffCode");

-- CreateIndex
CREATE INDEX "StaffProfile_clinicId_staffRole_idx" ON "StaffProfile"("clinicId", "staffRole");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_clinicId_key_key" ON "Setting"("clinicId", "key");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_clinicId_createdAt_idx" ON "AuditLog"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_clinicId_key_key" ON "Counter"("clinicId", "key");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_assignedTherapistId_fkey" FOREIGN KEY ("assignedTherapistId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalHistoryEntry" ADD CONSTRAINT "MedicalHistoryEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientConsent" ADD CONSTRAINT "PatientConsent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientReferral" ADD CONSTRAINT "PatientReferral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientPackage" ADD CONSTRAINT "PatientPackage_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PackageDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageTransaction" ADD CONSTRAINT "PackageTransaction_patientPackageId_fkey" FOREIGN KEY ("patientPackageId") REFERENCES "PatientPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRate" ADD CONSTRAINT "InsuranceRate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceRate" ADD CONSTRAINT "InsuranceRate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentEpisode" ADD CONSTRAINT "TreatmentEpisode_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentEpisode" ADD CONSTRAINT "TreatmentEpisode_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomMeasurement" ADD CONSTRAINT "RomMeasurement_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrengthMeasurement" ADD CONSTRAINT "StrengthMeasurement_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunctionalAssessmentItem" ADD CONSTRAINT "FunctionalAssessmentItem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanObjective" ADD CONSTRAINT "PlanObjective_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RehabilitationMilestone" ADD CONSTRAINT "RehabilitationMilestone_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanIntervention" ADD CONSTRAINT "PlanIntervention_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionIntervention" ADD CONSTRAINT "SessionIntervention_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TherapySession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReview" ADD CONSTRAINT "ProgressReview_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReview" ADD CONSTRAINT "ProgressReview_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TreatmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewObjectiveResult" ADD CONSTRAINT "ReviewObjectiveResult_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProgressReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discharge" ADD CONSTRAINT "Discharge_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discharge" ADD CONSTRAINT "Discharge_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DischargeRecommendation" ADD CONSTRAINT "DischargeRecommendation_dischargeId_fkey" FOREIGN KEY ("dischargeId") REFERENCES "Discharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "TreatmentEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
