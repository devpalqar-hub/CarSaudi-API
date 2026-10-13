-- CreateEnum
CREATE TYPE "FeaturedPlacementLocation" AS ENUM ('HOME_PAGE', 'LISTING_PAGE', 'PROPERTY_DETAIL_PAGE');

-- CreateEnum
CREATE TYPE "FeaturedPlanDuration" AS ENUM ('SEVEN_DAYS', 'TWENTY_DAYS', 'THIRTY_DAYS');

-- CreateEnum
CREATE TYPE "FeaturedPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'FREE');

-- AlterEnum
ALTER TYPE "Permission" ADD VALUE 'MANAGE_FEATURED';

-- CreateTable
CREATE TABLE "featured_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" "FeaturedPlacementLocation" NOT NULL,
    "duration" "FeaturedPlanDuration" NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "featured_subscriptions" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "location" "FeaturedPlacementLocation" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "paymentStatus" "FeaturedPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "stripeSessionId" TEXT,
    "paidAmount" DOUBLE PRECISION,
    "addedByAdminId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "featured_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "featured_subscriptions_stripeSessionId_key" ON "featured_subscriptions"("stripeSessionId");

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "featured_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_addedByAdminId_fkey" FOREIGN KEY ("addedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "featured_subscriptions" ADD CONSTRAINT "featured_subscriptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
