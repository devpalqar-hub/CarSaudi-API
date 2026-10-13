/*
  Warnings:

  - You are about to drop the column `amenities` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `furnishingStatus` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `nearbyTags` on the `listings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "listings" DROP COLUMN "amenities",
DROP COLUMN "furnishingStatus",
DROP COLUMN "nearbyTags",
ADD COLUMN     "furnishingId" TEXT;

-- CreateTable
CREATE TABLE "amenity_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amenity_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nearby_tag_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nearby_tag_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "furnishing_options" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "furnishing_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ListingToNearbyTagOption" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ListingToNearbyTagOption_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AmenityOptionToListing" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AmenityOptionToListing_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "amenity_options_title_key" ON "amenity_options"("title");

-- CreateIndex
CREATE UNIQUE INDEX "nearby_tag_options_title_key" ON "nearby_tag_options"("title");

-- CreateIndex
CREATE UNIQUE INDEX "furnishing_options_title_key" ON "furnishing_options"("title");

-- CreateIndex
CREATE INDEX "_ListingToNearbyTagOption_B_index" ON "_ListingToNearbyTagOption"("B");

-- CreateIndex
CREATE INDEX "_AmenityOptionToListing_B_index" ON "_AmenityOptionToListing"("B");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_furnishingId_fkey" FOREIGN KEY ("furnishingId") REFERENCES "furnishing_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ListingToNearbyTagOption" ADD CONSTRAINT "_ListingToNearbyTagOption_A_fkey" FOREIGN KEY ("A") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ListingToNearbyTagOption" ADD CONSTRAINT "_ListingToNearbyTagOption_B_fkey" FOREIGN KEY ("B") REFERENCES "nearby_tag_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AmenityOptionToListing" ADD CONSTRAINT "_AmenityOptionToListing_A_fkey" FOREIGN KEY ("A") REFERENCES "amenity_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AmenityOptionToListing" ADD CONSTRAINT "_AmenityOptionToListing_B_fkey" FOREIGN KEY ("B") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
