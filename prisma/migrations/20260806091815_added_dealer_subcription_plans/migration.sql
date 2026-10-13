/*
  Warnings:

  - A unique constraint covering the columns `[stripeSessionId]` on the table `listings` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ListingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FREE', 'FAILED');

-- AlterTable
ALTER TABLE "dealer_profiles" ADD COLUMN     "availableFreeFeatured" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "availableFreeListings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentFeaturingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "currentListingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionValidUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "dealer_subscription_plans" ADD COLUMN     "freeFeaturedListings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "freeListings" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "listingDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "paymentStatus" "ListingPaymentStatus" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "stripeSessionId" TEXT;

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "listings_stripeSessionId_key" ON "listings"("stripeSessionId");
