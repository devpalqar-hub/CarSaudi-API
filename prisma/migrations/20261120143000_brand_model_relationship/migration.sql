-- Step 1: Drop old unique index on title if it exists
DROP INDEX IF EXISTS "car_model_options_title_key";

-- Step 2: Add brandId as nullable first so existing rows do not violate NOT NULL
ALTER TABLE "car_model_options" ADD COLUMN IF NOT EXISTS "brandId" TEXT;

-- Step 3: Backfill brandId from existing car_listings if any exist
UPDATE "car_model_options" m
SET "brandId" = l."brandId"
FROM "car_listings" l
WHERE m."id" = l."modelId" AND m."brandId" IS NULL;

-- Step 4: Backfill known common models by matching brand names
UPDATE "car_model_options" m
SET "brandId" = b."id"
FROM "car_brand_options" b
WHERE m."brandId" IS NULL AND (
  (b."name" = 'Toyota' AND m."title" IN ('Camry', 'Corolla', 'Land Cruiser', 'Hilux', 'Yaris', 'RAV4', 'Fortuner', 'Avalon', 'Prado')) OR
  (b."name" = 'Honda' AND m."title" IN ('Civic', 'Accord', 'CR-V', 'HR-V', 'Pilot', 'City')) OR
  (b."name" = 'Nissan' AND m."title" IN ('Patrol', 'Altima', 'Sunny', 'Maxima', 'Pathfinder', 'X-Trail')) OR
  (b."name" = 'Hyundai' AND m."title" IN ('Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Accent', 'Creta')) OR
  (b."name" = 'Kia' AND m."title" IN ('Sportage', 'Optima', 'Sorento', 'Cerato', 'Pegas', 'K5')) OR
  (b."name" = 'Ford' AND m."title" IN ('F-150', 'Explorer', 'Mustang', 'Taurus', 'Expedition')) OR
  (b."name" = 'Chevrolet' AND m."title" IN ('Tahoe', 'Camaro', 'Suburban', 'Malibu', 'Caprice')) OR
  (b."name" = 'Lexus' AND m."title" IN ('ES 350', 'RX 350', 'LX 570', 'LX 600', 'IS 300')) OR
  (b."name" = 'BMW' AND m."title" IN ('3 Series', '5 Series', '7 Series', 'X5', 'X6')) OR
  (b."name" = 'Mercedes-Benz' AND m."title" IN ('C-Class', 'E-Class', 'S-Class', 'G-Class', 'GLE', 'GLC')) OR
  (b."name" = 'GMC' AND m."title" IN ('Yukon', 'Sierra', 'Acadia', 'Terrain')) OR
  (b."name" = 'Mitsubishi' AND m."title" IN ('Pajero', 'Outlander', 'ASX', 'L200'))
);

-- Step 5: If there are still models with NULL brandId, ensure at least one fallback brand exists and assign them
INSERT INTO "car_brand_options" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT 'default_brand_general', 'Other', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "car_brand_options");

UPDATE "car_model_options"
SET "brandId" = (SELECT "id" FROM "car_brand_options" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "brandId" IS NULL;

-- Step 6: Delete duplicate (brandId, title) combinations if any exist prior to creating the unique constraint
DELETE FROM "car_model_options" a USING "car_model_options" b
WHERE a."id" > b."id" AND a."brandId" = b."brandId" AND a."title" = b."title";

-- Step 7: Now that every row is guaranteed to have a valid brandId, enforce NOT NULL
ALTER TABLE "car_model_options" ALTER COLUMN "brandId" SET NOT NULL;

-- Step 8: Create indexes
CREATE INDEX IF NOT EXISTS "car_model_options_brandId_idx" ON "car_model_options"("brandId");
CREATE UNIQUE INDEX IF NOT EXISTS "car_model_options_brandId_title_key" ON "car_model_options"("brandId", "title");

-- Step 9: Add Foreign Key Constraint with CASCADE delete
ALTER TABLE "car_model_options" DROP CONSTRAINT IF EXISTS "car_model_options_brandId_fkey";
ALTER TABLE "car_model_options" ADD CONSTRAINT "car_model_options_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "car_brand_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
