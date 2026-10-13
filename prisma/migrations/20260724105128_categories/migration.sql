/*
  Warnings:

  - You are about to drop the column `type` on the `listings` table. All the data in the column will be lost.
  - Added the required column `typeId` to the `listings` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "listings" DROP COLUMN "type",
ADD COLUMN     "typeId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "ListingType";

-- CreateTable
CREATE TABLE "listing_type_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_type_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_type_options_title_key" ON "listing_type_options"("title");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "listing_type_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
