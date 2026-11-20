-- Indexes for dashboard / list / stats queries that filter by clinic + date or status
CREATE INDEX "Payment_clinicId_paidAt_idx" ON "Payment"("clinicId", "paidAt");
CREATE INDEX "TherapySession_clinicId_date_idx" ON "TherapySession"("clinicId", "date");
CREATE INDEX "Assessment_clinicId_status_idx" ON "Assessment"("clinicId", "status");
