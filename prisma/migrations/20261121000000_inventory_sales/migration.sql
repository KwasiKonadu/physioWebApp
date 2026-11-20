-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 5,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "sellPriceCents" INTEGER NOT NULL DEFAULT 0,
    "supplier" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "saleId" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "patientId" TEXT,
    "customerName" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "note" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "soldById" TEXT,
    "soldByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryItem_clinicId_name_idx" ON "InventoryItem"("clinicId", "name");
CREATE INDEX "InventoryItem_clinicId_category_idx" ON "InventoryItem"("clinicId", "category");
CREATE INDEX "StockMovement_clinicId_createdAt_idx" ON "StockMovement"("clinicId", "createdAt");
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");
CREATE UNIQUE INDEX "Sale_saleNumber_key" ON "Sale"("saleNumber");
CREATE INDEX "Sale_clinicId_createdAt_idx" ON "Sale"("clinicId", "createdAt");
CREATE INDEX "Sale_patientId_idx" ON "Sale"("patientId");
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");
CREATE INDEX "SaleLine_itemId_idx" ON "SaleLine"("itemId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default-deny the Supabase REST API (same as every other table)
ALTER TABLE "public"."InventoryItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."SaleLine" ENABLE ROW LEVEL SECURITY;

-- New permissions: inventory.view / inventory.manage
-- Administrator + Receptionist get both, Management gets view only.
UPDATE "Role"
SET "permissions" = ("permissions"::jsonb || '["inventory.view","inventory.manage"]'::jsonb)::text
WHERE "name" IN ('Clinic Administrator', 'Receptionist') AND NOT ("permissions"::jsonb ? 'inventory.view');

UPDATE "Role"
SET "permissions" = ("permissions"::jsonb || '["inventory.view"]'::jsonb)::text
WHERE "name" = 'Management' AND NOT ("permissions"::jsonb ? 'inventory.view');
