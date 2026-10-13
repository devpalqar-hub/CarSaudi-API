-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('LISTING_PAYMENT', 'FEATURED_LISTING', 'DEALER_SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PAID', 'FREE');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PAID',
    "billedToId" TEXT NOT NULL,
    "billedToName" TEXT NOT NULL,
    "billedToEmail" TEXT,
    "billedToPhone" TEXT,
    "billedToCompany" TEXT,
    "billedToTradeNumber" TEXT,
    "billedToAddress" TEXT,
    "description" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "referenceId" TEXT NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'QAR',
    "paymentMethod" TEXT NOT NULL DEFAULT 'Stripe',
    "paidAt" TIMESTAMP(3),
    "pdfObjectKey" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_billedToId_idx" ON "invoices"("billedToId");

-- CreateIndex
CREATE INDEX "invoices_type_idx" ON "invoices"("type");

-- CreateIndex
CREATE INDEX "invoices_referenceId_idx" ON "invoices"("referenceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billedToId_fkey" FOREIGN KEY ("billedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
