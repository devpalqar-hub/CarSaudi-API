/*
  Warnings:

  - You are about to drop the column `location` on the `featured_plans` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DealerSubPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FREE', 'FAILED');

-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'SOLD';

-- AlterTable
ALTER TABLE "dealer_profiles" ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "tagline" TEXT;

-- AlterTable
ALTER TABLE "featured_plans" DROP COLUMN "location",
ADD COLUMN     "locations" "FeaturedPlacementLocation"[];

-- AlterTable
ALTER TABLE "featured_subscriptions" ADD COLUMN     "discountApplied" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "dealer_subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxListings" INTEGER NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "boostDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_subscriptions" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "paymentStatus" "DealerSubPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "stripeSessionId" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "assignedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dealer_subscriptions_stripeSessionId_key" ON "dealer_subscriptions"("stripeSessionId");

-- AddForeignKey
ALTER TABLE "dealer_subscriptions" ADD CONSTRAINT "dealer_subscriptions_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_subscriptions" ADD CONSTRAINT "dealer_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "dealer_subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_subscriptions" ADD CONSTRAINT "dealer_subscriptions_assignedByAdminId_fkey" FOREIGN KEY ("assignedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
