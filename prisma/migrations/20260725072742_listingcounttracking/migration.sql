-- CreateEnum
CREATE TYPE "TrackingLogType" AS ENUM ('IMPRESSION', 'VIEW');

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "impressionsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reachCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "listing_tracking_logs" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "TrackingLogType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_tracking_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_tracking_logs_listingId_deviceId_type_createdAt_idx" ON "listing_tracking_logs"("listingId", "deviceId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "listing_tracking_logs" ADD CONSTRAINT "listing_tracking_logs_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
