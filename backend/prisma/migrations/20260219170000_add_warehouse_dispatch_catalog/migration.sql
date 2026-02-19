-- CreateTable
CREATE TABLE "WarehouseDispatchDriver" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "tcNo" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WarehouseDispatchDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseDispatchVehicle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "plate" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WarehouseDispatchVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseDispatchDriver_tcNo_key" ON "WarehouseDispatchDriver"("tcNo");

-- CreateIndex
CREATE INDEX "WarehouseDispatchDriver_active_idx" ON "WarehouseDispatchDriver"("active");

-- CreateIndex
CREATE INDEX "WarehouseDispatchDriver_lastName_firstName_idx" ON "WarehouseDispatchDriver"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseDispatchVehicle_plate_key" ON "WarehouseDispatchVehicle"("plate");

-- CreateIndex
CREATE INDEX "WarehouseDispatchVehicle_active_idx" ON "WarehouseDispatchVehicle"("active");

-- CreateIndex
CREATE INDEX "WarehouseDispatchVehicle_name_idx" ON "WarehouseDispatchVehicle"("name");
