/*
  Warnings:

  - You are about to drop the column `municipality` on the `listings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "listing_type_options" ADD COLUMN     "image" TEXT;

-- AlterTable
ALTER TABLE "listings" DROP COLUMN "municipality",
ADD COLUMN     "municipalityId" TEXT;

-- DropEnum
DROP TYPE "QatarMunicipality";

-- CreateTable
CREATE TABLE "municipality_options" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "municipality_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "municipality_options_name_key" ON "municipality_options"("name");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "municipality_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
