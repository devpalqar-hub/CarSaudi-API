/*
  Warnings:

  - You are about to drop the column `city` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `images` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `rejectionReason` on the `listings` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `listings` table. All the data in the column will be lost.
  - Added the required column `propertyName` to the `listings` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ListingPurpose" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "ListingReviewAction" AS ENUM ('APPROVED', 'REJECTED', 'RESUBMITTED', 'EDITED_BY_ADMIN', 'FLAGGED_DUPLICATE');

-- CreateEnum
CREATE TYPE "QatarMunicipality" AS ENUM ('DOHA', 'AL_RAYYAN', 'UMM_SALAL', 'AL_KHOR', 'AL_WAKRAH', 'AL_SHAMAL', 'AL_DAAYEN', 'AL_SHEEHANIYA');

-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'RESUBMITTED';

-- AlterTable
ALTER TABLE "listings" DROP COLUMN "city",
DROP COLUMN "images",
DROP COLUMN "location",
DROP COLUMN "rejectionReason",
DROP COLUMN "title",
ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "areaName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contactVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactWhatsapp" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'Qatar',
ADD COLUMN     "duplicateOfId" TEXT,
ADD COLUMN     "extraProperties" JSONB,
ADD COLUMN     "floorNumber" INTEGER,
ADD COLUMN     "furnishingStatus" TEXT,
ADD COLUMN     "isPotentialDuplicate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "livingRooms" INTEGER,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "municipality" "QatarMunicipality",
ADD COLUMN     "nearbyTags" TEXT[],
ADD COLUMN     "otherFeatures" TEXT,
ADD COLUMN     "parkingSpaces" INTEGER,
ADD COLUMN     "priceNegotiable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "propertyName" TEXT NOT NULL,
ADD COLUMN     "purpose" "ListingPurpose" NOT NULL DEFAULT 'SALE',
ADD COLUMN     "submissionCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "totalFloors" INTEGER,
ADD COLUMN     "yearBuilt" INTEGER;

-- CreateTable
CREATE TABLE "listing_photos" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "minioKey" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_reviews" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "action" "ListingReviewAction" NOT NULL,
    "message" TEXT,
    "snapshot" JSONB,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_reviews_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
