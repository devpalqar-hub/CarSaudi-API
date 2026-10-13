-- AlterEnum
ALTER TYPE "TrackingLogType" ADD VALUE 'WHATSAPP_CLICK';

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "whatsappClicksCount" INTEGER NOT NULL DEFAULT 0;
