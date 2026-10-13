-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "listings_stripePaymentIntentId_key" ON "listings"("stripePaymentIntentId");
