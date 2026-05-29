/*
  Warnings:

  - You are about to drop the `vehicles` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'SOLD', 'DELETED');

-- CreateEnum
CREATE TYPE "FlagReason" AS ENUM ('MISLEADING', 'INAPPROPRIATE', 'FRAUDULENT', 'DUPLICATE', 'SPAM', 'WRONG_PRICE', 'OTHER');

-- CreateEnum
CREATE TYPE "FlagStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID', 'LPG', 'CNG');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('AUTOMATIC', 'MANUAL', 'CVT', 'SEMI_AUTOMATIC');

-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('SEDAN', 'SUV', 'HATCHBACK', 'COUPE', 'CONVERTIBLE', 'WAGON', 'VAN', 'TRUCK', 'BUS', 'OTHER');

-- CreateEnum
CREATE TYPE "ConditionType" AS ENUM ('NEW', 'USED', 'CERTIFIED_PRE_OWNED');

-- CreateEnum
CREATE TYPE "DealerStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "dealers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "maxListings" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "DealerStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
ADD COLUMN     "subscriptionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "totalInquiries" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalListings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalViews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tradeLicenseNumber" TEXT,
ADD COLUMN     "tradeLicenseUrl" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "websiteUrl" TEXT;

-- DropTable
DROP TABLE "vehicles";

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sellerId" TEXT NOT NULL,
    "dealerId" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "mileage" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "negotiable" BOOLEAN NOT NULL DEFAULT false,
    "fuelType" "FuelType",
    "transmission" "TransmissionType",
    "bodyType" "BodyType",
    "condition" "ConditionType" NOT NULL DEFAULT 'USED',
    "color" TEXT,
    "engineSize" TEXT,
    "horsepower" INTEGER,
    "doors" INTEGER,
    "cylinders" INTEGER,
    "vin" TEXT,
    "city" TEXT,
    "region" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "rejectionReason" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "inquiryCount" INTEGER NOT NULL DEFAULT 0,
    "flagCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_images" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_flags" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "flaggedById" TEXT NOT NULL,
    "reason" "FlagReason" NOT NULL,
    "description" TEXT,
    "status" "FlagStatus" NOT NULL DEFAULT 'PENDING',
    "moderatorId" TEXT,
    "moderatorNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_views" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "viewerId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_inquiries" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "listings"("status");

-- CreateIndex
CREATE INDEX "listings_sellerId_idx" ON "listings"("sellerId");

-- CreateIndex
CREATE INDEX "listings_dealerId_idx" ON "listings"("dealerId");

-- CreateIndex
CREATE INDEX "listings_make_model_idx" ON "listings"("make", "model");

-- CreateIndex
CREATE INDEX "listings_price_idx" ON "listings"("price");

-- CreateIndex
CREATE INDEX "listings_city_idx" ON "listings"("city");

-- CreateIndex
CREATE INDEX "listings_isFeatured_idx" ON "listings"("isFeatured");

-- CreateIndex
CREATE INDEX "listings_createdAt_idx" ON "listings"("createdAt");

-- CreateIndex
CREATE INDEX "listings_expiresAt_idx" ON "listings"("expiresAt");

-- CreateIndex
CREATE INDEX "listing_images_listingId_idx" ON "listing_images"("listingId");

-- CreateIndex
CREATE INDEX "listing_flags_listingId_idx" ON "listing_flags"("listingId");

-- CreateIndex
CREATE INDEX "listing_flags_flaggedById_idx" ON "listing_flags"("flaggedById");

-- CreateIndex
CREATE INDEX "listing_flags_status_idx" ON "listing_flags"("status");

-- CreateIndex
CREATE INDEX "listing_views_listingId_idx" ON "listing_views"("listingId");

-- CreateIndex
CREATE INDEX "listing_views_viewerId_idx" ON "listing_views"("viewerId");

-- CreateIndex
CREATE INDEX "listing_views_createdAt_idx" ON "listing_views"("createdAt");

-- CreateIndex
CREATE INDEX "listing_inquiries_listingId_idx" ON "listing_inquiries"("listingId");

-- CreateIndex
CREATE INDEX "listing_inquiries_userId_idx" ON "listing_inquiries"("userId");

-- CreateIndex
CREATE INDEX "listing_inquiries_isRead_idx" ON "listing_inquiries"("isRead");

-- CreateIndex
CREATE INDEX "dealers_status_idx" ON "dealers"("status");

-- CreateIndex
CREATE INDEX "dealers_subscriptionTier_idx" ON "dealers"("subscriptionTier");

-- CreateIndex
CREATE INDEX "dealers_city_idx" ON "dealers"("city");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "dealers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_flags" ADD CONSTRAINT "listing_flags_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_flags" ADD CONSTRAINT "listing_flags_flaggedById_fkey" FOREIGN KEY ("flaggedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_flags" ADD CONSTRAINT "listing_flags_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_inquiries" ADD CONSTRAINT "listing_inquiries_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_inquiries" ADD CONSTRAINT "listing_inquiries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
