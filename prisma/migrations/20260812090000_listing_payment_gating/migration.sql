-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "freeListingsUsed" INTEGER NOT NULL DEFAULT 0;
