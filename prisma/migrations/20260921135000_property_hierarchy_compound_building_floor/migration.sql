/*
  Non-destructive migration: introduces the Compound -> Building -> Floor
  hierarchy above Unit, without dropping or losing any existing data.

  Property and Unit.propertyId are NOT removed - they become optional/legacy
  (see docs/PROPERTY-HIERARCHY.md). Every existing Unit is backfilled with a
  generated one-Compound/one-Building/one-Floor per Property it belonged to,
  so `floorId` can safely become NOT NULL for every row, old and new alike.

  Order matters here: new tables and nullable columns are created first,
  data is backfilled next, and NOT NULL / destructive column drops only
  happen last, once every row is guaranteed to have a value.
*/

-- CreateEnum
CREATE TYPE "CompoundStatus" AS ENUM ('PLANNING', 'UNDER_CONSTRUCTION', 'ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "compounds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "arabicName" TEXT,
    "description" TEXT,
    "address" TEXT,
    "city" TEXT,
    "location" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "ownerName" TEXT,
    "managerName" TEXT,
    "totalBuildings" INTEGER NOT NULL DEFAULT 0,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "amenities" TEXT,
    "status" "CompoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "compoundId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "description" TEXT,
    "numberOfFloors" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "floorNumber" INTEGER NOT NULL,
    "name" TEXT,
    "nameAr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add the new columns nullable first, and relax propertyId to optional.
-- (`floor` free-text column is kept for now and copied into `floorLabel` below
-- before being dropped, so no data is lost.)
ALTER TABLE "units"
  ADD COLUMN "floorId" TEXT,
  ADD COLUMN "floorLabel" TEXT,
  ALTER COLUMN "propertyId" DROP NOT NULL;

-- DataMigration: preserve the old free-text floor description under its new name.
UPDATE "units" SET "floorLabel" = "floor" WHERE "floor" IS NOT NULL;

-- DataMigration: generate one Compound + one Building + one Floor per
-- existing Property, deterministically keyed off the property's own id
-- (so this is safe to re-derive and never collides), then point every
-- existing Unit at the floor generated for its property.
INSERT INTO "compounds" ("id", "organizationId", "name", "arabicName", "city", "address", "status", "totalBuildings", "totalUnits", "createdAt", "updatedAt")
SELECT
  'shim-compound-' || p."id",
  p."organizationId",
  p."name",
  p."nameAr",
  p."city",
  p."street",
  'ACTIVE',
  1,
  (SELECT COUNT(*) FROM "units" u WHERE u."propertyId" = p."id"),
  p."createdAt",
  p."updatedAt"
FROM "properties" p;

INSERT INTO "buildings" ("id", "organizationId", "compoundId", "name", "numberOfFloors", "createdAt", "updatedAt")
SELECT
  'shim-building-' || p."id",
  p."organizationId",
  'shim-compound-' || p."id",
  'Main Building',
  1,
  p."createdAt",
  p."updatedAt"
FROM "properties" p;

INSERT INTO "floors" ("id", "organizationId", "buildingId", "floorNumber", "name", "createdAt", "updatedAt")
SELECT
  'shim-floor-' || p."id",
  p."organizationId",
  'shim-building-' || p."id",
  1,
  'Ground Floor',
  p."createdAt",
  p."updatedAt"
FROM "properties" p;

UPDATE "units" u
SET "floorId" = 'shim-floor-' || u."propertyId"
WHERE u."propertyId" IS NOT NULL AND u."floorId" IS NULL;

-- Any unit that somehow has no property (shouldn't exist yet, since
-- propertyId was NOT NULL before this migration, but guarded defensively
-- for safety) gets its own standalone shim compound/building/floor so
-- floorId can still become NOT NULL without any data loss.
INSERT INTO "compounds" ("id", "organizationId", "name", "status", "totalBuildings", "totalUnits", "createdAt", "updatedAt")
SELECT 'shim-compound-unit-' || u."id", u."organizationId", 'Unassigned', 'ACTIVE', 1, 1, u."createdAt", u."updatedAt"
FROM "units" u WHERE u."floorId" IS NULL;

INSERT INTO "buildings" ("id", "organizationId", "compoundId", "name", "numberOfFloors", "createdAt", "updatedAt")
SELECT 'shim-building-unit-' || u."id", u."organizationId", 'shim-compound-unit-' || u."id", 'Main Building', 1, u."createdAt", u."updatedAt"
FROM "units" u WHERE u."floorId" IS NULL;

INSERT INTO "floors" ("id", "organizationId", "buildingId", "floorNumber", "name", "createdAt", "updatedAt")
SELECT 'shim-floor-unit-' || u."id", u."organizationId", 'shim-building-unit-' || u."id", 1, 'Ground Floor', u."createdAt", u."updatedAt"
FROM "units" u WHERE u."floorId" IS NULL;

UPDATE "units" u SET "floorId" = 'shim-floor-unit-' || u."id" WHERE u."floorId" IS NULL;

-- Now that every row is guaranteed to have a floorId, drop the old
-- free-text column (already copied into floorLabel above) and enforce
-- NOT NULL on the new one.
ALTER TABLE "units" DROP COLUMN "floor";
ALTER TABLE "units" ALTER COLUMN "floorId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "compounds_organizationId_idx" ON "compounds"("organizationId");

-- CreateIndex
CREATE INDEX "buildings_organizationId_idx" ON "buildings"("organizationId");

-- CreateIndex
CREATE INDEX "buildings_compoundId_idx" ON "buildings"("compoundId");

-- CreateIndex
CREATE INDEX "floors_organizationId_idx" ON "floors"("organizationId");

-- CreateIndex
CREATE INDEX "floors_buildingId_idx" ON "floors"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "floors_buildingId_floorNumber_key" ON "floors"("buildingId", "floorNumber");

-- CreateIndex
CREATE INDEX "units_floorId_idx" ON "units"("floorId");

-- AddForeignKey
ALTER TABLE "compounds" ADD CONSTRAINT "compounds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_compoundId_fkey" FOREIGN KEY ("compoundId") REFERENCES "compounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
