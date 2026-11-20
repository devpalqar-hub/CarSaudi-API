-- DropIndex
DROP INDEX IF EXISTS "car_model_options_title_key";

-- AlterTable
ALTER TABLE "car_model_options" ADD COLUMN "brandId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "car_model_options_brandId_idx" ON "car_model_options"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "car_model_options_brandId_title_key" ON "car_model_options"("brandId", "title");

-- AddForeignKey
ALTER TABLE "car_model_options" ADD CONSTRAINT "car_model_options_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "car_brand_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
