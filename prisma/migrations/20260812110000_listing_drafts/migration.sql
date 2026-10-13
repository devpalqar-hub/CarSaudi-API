-- CreateEnum
CREATE TYPE "ListingDraftSource" AS ENUM ('JSON', 'EXCEL', 'CSV');

-- CreateEnum
CREATE TYPE "ListingDraftStatus" AS ENUM ('PENDING', 'USED', 'DISCARDED');

-- CreateTable
CREATE TABLE "listing_drafts" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "source" "ListingDraftSource" NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "dealerUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "ListingDraftStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "errors" JSONB,
    "listingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "listing_drafts_listingId_key" ON "listing_drafts"("listingId");

-- CreateIndex
CREATE INDEX "listing_drafts_dealerUserId_status_idx" ON "listing_drafts"("dealerUserId", "status");

-- CreateIndex
CREATE INDEX "listing_drafts_batchId_idx" ON "listing_drafts"("batchId");

-- AddForeignKey
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_drafts" ADD CONSTRAINT "listing_drafts_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
