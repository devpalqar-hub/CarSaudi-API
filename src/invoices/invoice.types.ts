import { InvoiceStatus, InvoiceType } from '@prisma/client';

/** One row of an invoice's itemised breakdown — kept generic so all three billable flows share it. */
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/**
 * Common input every payable flow (listing payment, featured boost, dealer subscription)
 * builds and hands to `InvoicesService.createForTransaction()` — the one place that turns
 * a completed action into a numbered invoice, a PDF, and a receipt email.
 */
export interface CreateInvoiceInput {
  type: InvoiceType;
  /** id of the Listing / FeaturedSubscription (primary) / DealerSubscription this documents */
  referenceId: string;
  /** Account being billed — a USER id, or a DEALER id (never a DEALER_STAFF id) */
  billedToId: string;
  /** Invoice title, e.g. "Featured Listing — The Pearl Villa" */
  description: string;
  lineItems: InvoiceLineItem[];
  /** Sum of lineItems' amounts, before VAT */
  subtotal: number;
  status: InvoiceStatus;
  paymentMethod?: string;
  paidAt?: Date;
}
