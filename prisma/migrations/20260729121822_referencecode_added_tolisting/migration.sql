/*
  Warnings:

  - A unique constraint covering the columns `[referenceCode]` on the table `listings` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "referenceCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "listings_referenceCode_key" ON "listings"("referenceCode");
