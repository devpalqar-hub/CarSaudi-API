/*
  Warnings:

  - Added the required column `updatedAt` to the `dealer_staff` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DealerStaffPermission" AS ENUM ('MANAGE_LISTINGS', 'MANAGE_CHATS', 'VIEW_ANALYTICS', 'MANAGE_STAFF');

-- AlterTable
ALTER TABLE "dealer_staff" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "permissions" "DealerStaffPermission"[],
ADD COLUMN     "position" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
