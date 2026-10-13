import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Invoice,
  InvoiceStatus,
  Permission,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { MinioService } from '../shared/minio.service';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { buildInvoicePdf, InvoiceSeller } from './invoice-pdf.builder';
import { CreateInvoiceInput } from './invoice.types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly minio: MinioService,
    private readonly configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // Company (seller) details — Qatar standard invoice header. Configure the real
  // Commercial Registration number, address, etc. via env vars in production.
  // ─────────────────────────────────────────────────────────────────────────────

  private getSeller(): InvoiceSeller {
    return {
      name: this.configService.get<string>(
        'INVOICE_COMPANY_NAME',
        'VillasQatar',
      ),
      nameAr: this.configService.get<string>('INVOICE_COMPANY_NAME_AR', ''),
      crNumber: this.configService.get<string>('INVOICE_COMPANY_CR_NUMBER', ''),
      address: this.configService.get<string>(
        'INVOICE_COMPANY_ADDRESS',
        'Doha, Qatar',
      ),
      phone: this.configService.get<string>('INVOICE_COMPANY_PHONE', ''),
      email: this.configService.get<string>(
        'INVOICE_COMPANY_EMAIL',
        'billing@villasqatar.com',
      ),
    };
  }

  /** Qatar currently has no general VAT in effect — defaults to 0%, configurable for the future. */
  private getVatRate(): number {
    return Number(this.configService.get<string>('INVOICE_VAT_RATE', '0')) || 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Create — the one entry point every payable flow calls once an action completes
  // (listing payment, featured boost, dealer subscription — PAID or FREE alike).
  // ─────────────────────────────────────────────────────────────────────────────

  async createForTransaction(input: CreateInvoiceInput): Promise<Invoice> {
    const buyer = await this.resolveBillingParty(input.billedToId);
    const vatRate = this.getVatRate();
    const subtotal = round2(input.subtotal);
    const vatAmount = round2(subtotal * (vatRate / 100));
    const totalAmount = round2(subtotal + vatAmount);

    let invoice: Invoice | null = null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 5 && !invoice; attempt++) {
      const invoiceNumber = await this.nextInvoiceNumber(attempt);
      try {
        invoice = await this.prisma.invoice.create({
          data: {
            invoiceNumber,
            type: input.type,
            status: input.status,
            billedToId: buyer.id,
            billedToName: buyer.name,
            billedToEmail: buyer.email,
            billedToPhone: buyer.phone,
            billedToCompany: buyer.company,
            billedToTradeNumber: buyer.tradeNumber,
            billedToAddress: buyer.address,
            description: input.description,
            lineItems: input.lineItems as unknown as Prisma.InputJsonValue,
            referenceId: input.referenceId,
            subtotal,
            vatRate,
            vatAmount,
            totalAmount,
            currency: 'QAR',
            paymentMethod:
              input.status === InvoiceStatus.FREE
                ? 'N/A'
                : (input.paymentMethod ?? 'Stripe'),
            paidAt:
              input.status === InvoiceStatus.PAID
                ? (input.paidAt ?? new Date())
                : null,
          },
        });
      } catch (err: any) {
        lastError = err;
        if (err?.code === 'P2002') continue; // invoiceNumber collision — retry with the next number
        throw err;
      }
    }

    if (!invoice) {
      this.logger.error(
        `Failed to allocate a unique invoice number: ${(lastError as any)?.message}`,
      );
      throw lastError instanceof Error
        ? lastError
        : new Error('Failed to create invoice');
    }

    // PDF render + MinIO upload + receipt email — best-effort, never blocks/fails the caller
    // (a listing/feature/subscription must still activate even if billing/email hiccups).
    this.finalizePdfAndEmail(invoice).catch((err) =>
      this.logger.warn(
        `Invoice ${invoice.invoiceNumber} PDF/email step failed: ${err?.message}`,
      ),
    );

    return invoice;
  }

  private async nextInvoiceNumber(offset = 0): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const count = await this.prisma.invoice.count({
      where: { invoiceNumber: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1 + offset).padStart(6, '0')}`;
  }

  /**
   * Resolves the buyer snapshot for an invoice. DEALER_STAFF accounts never get billed
   * directly — their agency's quota/payment always belongs to the parent DEALER, so an
   * invoice for a staff-performed action is billed to that dealer instead.
   */
  private async resolveBillingParty(userId: string): Promise<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    tradeNumber: string | null;
    address: string | null;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        dealerProfile: {
          select: {
            dealerName: true,
            tradeNumber: true,
            address: true,
            city: true,
            country: true,
            contactPhone: true,
          },
        },
        dealerStaffMember: { select: { dealerUserId: true } },
      },
    });
    if (!user) throw new NotFoundException('Billed-to account not found');

    if (user.role === UserRole.DEALER_STAFF && user.dealerStaffMember) {
      return this.resolveBillingParty(user.dealerStaffMember.dealerUserId);
    }

    const dp = user.dealerProfile;
    const addressParts = dp
      ? [dp.address, dp.city, dp.country].filter(Boolean)
      : [];

    return {
      id: user.id,
      name: user.name ?? dp?.dealerName ?? 'Customer',
      email: user.email,
      phone: user.phone ?? dp?.contactPhone ?? null,
      company: dp?.dealerName ?? null,
      tradeNumber: dp?.tradeNumber ?? null,
      address: addressParts.length ? addressParts.join(', ') : null,
    };
  }

  private async finalizePdfAndEmail(invoice: Invoice): Promise<void> {
    const pdfBuffer = await buildInvoicePdf(invoice, this.getSeller());
    const objectKey = `invoices/${invoice.invoiceNumber}.pdf`;
    await this.minio.uploadFile(
      pdfBuffer,
      objectKey,
      'application/pdf',
      pdfBuffer.length,
    );
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { pdfObjectKey: objectKey },
    });

    if (invoice.billedToEmail) {
      this.mail.sendMail({
        to: invoice.billedToEmail,
        subject: `Invoice ${invoice.invoiceNumber} from ${this.getSeller().name}`,
        html: this.buildInvoiceEmailHtml(invoice),
        attachments: [
          {
            filename: `${invoice.invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { emailedAt: new Date() },
      });
    }
  }

  /** Detailed bill/receipt HTML — same layout for USER and DEALER recipients alike. */
  private buildInvoiceEmailHtml(invoice: Invoice): string {
    const seller = this.getSeller();
    const lineItems = (invoice.lineItems as any[]) ?? [];
    const isFree = invoice.status === InvoiceStatus.FREE;

    const rows = lineItems
      .map(
        (item) => `
          <tr>
            <td style="padding:8px 12px; border-bottom:1px solid #eee;">${item.description}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">${item.quantity}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">QAR ${item.unitPrice.toFixed(2)}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">QAR ${item.amount.toFixed(2)}</td>
          </tr>`,
      )
      .join('');

    // No repeated brand banner here — MailService already prepends the
    // VillasQatar logo above every email, so this card leads straight into
    // the invoice content.
    return `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #333;">
        <div style="background: #fff; padding: 32px; border: 1px solid #e5d9c8; border-top: 3px solid #8a1538; border-radius: 8px;">
          <h2 style="margin-top:0; color:#8a1538;">${isFree ? 'Receipt' : 'Invoice'} ${invoice.invoiceNumber}</h2>
          <p style="margin:0 0 20px; color:#666; font-size:0.9em;">
            Date: ${new Date(invoice.createdAt).toDateString()} &nbsp;|&nbsp; Status: <strong>${invoice.status}</strong>
          </p>

          <p style="margin:0 0 4px;"><strong>Bill To:</strong></p>
          <p style="margin:0 0 20px; line-height:1.5;">
            ${invoice.billedToCompany ? `${invoice.billedToCompany}<br/>` : ''}
            ${invoice.billedToName}<br/>
            ${invoice.billedToAddress ?? ''}
          </p>

          <p style="font-weight:bold; margin-bottom:8px;">${invoice.description}</p>

          <table style="width:100%; border-collapse:collapse; font-size:0.9em; margin-bottom:16px;">
            <thead>
              <tr style="background:#f8eef1;">
                <th style="padding:8px 12px; text-align:left;">Description</th>
                <th style="padding:8px 12px; text-align:right;">Qty</th>
                <th style="padding:8px 12px; text-align:right;">Unit Price</th>
                <th style="padding:8px 12px; text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <table style="width:100%; font-size:0.9em; margin-bottom:24px;">
            <tr>
              <td style="text-align:right; padding:4px 12px; color:#666;">Subtotal</td>
              <td style="text-align:right; padding:4px 12px; width:120px;">QAR ${invoice.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="text-align:right; padding:4px 12px; color:#666;">VAT (${invoice.vatRate.toFixed(0)}%)</td>
              <td style="text-align:right; padding:4px 12px;">QAR ${invoice.vatAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="text-align:right; padding:8px 12px; font-weight:bold; font-size:1.1em; border-top:2px solid #8a1538;">Total</td>
              <td style="text-align:right; padding:8px 12px; font-weight:bold; font-size:1.1em; border-top:2px solid #8a1538; color:#8a1538;">QAR ${invoice.totalAmount.toFixed(2)}</td>
            </tr>
          </table>

          <p style="color:#666; font-size:0.85em; margin:0;">
            The detailed invoice is attached as a PDF for your records.<br/>
            Thank you for using <strong>${seller.name}</strong>.
          </p>
        </div>
      </div>
    `;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Read — one common, role-scoped API for USER, DEALER, DEALER_STAFF, MODERATOR, SUPER_ADMIN
  // ─────────────────────────────────────────────────────────────────────────────

  /** Resolves which account's invoices the requester is allowed to see. */
  private async resolveScope(
    requester: { id: string; role: UserRole },
    requestedUserId?: string,
  ): Promise<{ billedToId?: string }> {
    if (requester.role === UserRole.SUPER_ADMIN) {
      return { billedToId: requestedUserId };
    }

    if (requester.role === UserRole.MODERATOR) {
      const profile = await this.prisma.moderatorProfile.findUnique({
        where: { userId: requester.id },
        select: { permissions: true },
      });
      const canViewAll = profile?.permissions.includes(
        Permission.DASHBOARD_VIEW,
      );
      if (canViewAll) return { billedToId: requestedUserId };
      if (requestedUserId) {
        throw new ForbiddenException('Missing permission(s): VIEW_ANALYTICS');
      }
      return { billedToId: requester.id }; // moderators don't buy anything — will simply be empty
    }

    if (requestedUserId && requestedUserId !== requester.id) {
      throw new ForbiddenException('You can only view your own invoices');
    }

    if (requester.role === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: requester.id },
        select: { dealerUserId: true },
      });
      if (!staffRecord)
        throw new ForbiddenException('Dealer staff record not found');
      return { billedToId: staffRecord.dealerUserId };
    }

    // USER / DEALER — always their own
    return { billedToId: requester.id };
  }

  async list(
    requester: { id: string; role: UserRole },
    query: QueryInvoiceDto,
  ) {
    const {
      type,
      status,
      search,
      from,
      to,
      userId,
      page = 1,
      limit = 20,
    } = query;
    const scope = await this.resolveScope(requester, userId);

    const where: Prisma.InvoiceWhereInput = {
      ...(scope.billedToId && { billedToId: scope.billedToId }),
      ...(type && { type }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { billedToName: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const skip = (page - 1) * limit;
    const [total, invoices] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: invoices,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(
    requester: { id: string; role: UserRole },
    id: string,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    await this.assertCanView(requester, invoice);
    return invoice;
  }

  /**
   * Looks up an invoice by the id of the thing it documents — a Listing id, a
   * FeaturedSubscription id, or a DealerSubscription id — instead of the invoice's own id.
   * Lets callers go straight from e.g. `GET /listings/:id` to its invoice/receipt without
   * needing to know the invoice id. If more than one invoice exists for the same reference
   * (e.g. a listing paid for, then later re-invoiced), the most recent one is returned.
   */
  async findByReference(
    requester: { id: string; role: UserRole },
    referenceId: string,
  ): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { referenceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!invoice)
      throw new NotFoundException('No invoice found for this reference');
    await this.assertCanView(requester, invoice);
    return invoice;
  }

  async getPdf(
    requester: { id: string; role: UserRole },
    id: string,
  ): Promise<{ buffer: Buffer; invoice: Invoice }> {
    return this.renderPdf(await this.findOne(requester, id));
  }

  async getPdfByReference(
    requester: { id: string; role: UserRole },
    referenceId: string,
  ): Promise<{ buffer: Buffer; invoice: Invoice }> {
    return this.renderPdf(await this.findByReference(requester, referenceId));
  }

  private async renderPdf(
    invoice: Invoice,
  ): Promise<{ buffer: Buffer; invoice: Invoice }> {
    if (!invoice.pdfObjectKey) {
      // PDF wasn't generated yet (e.g. still in-flight from createForTransaction) — render on demand.
      const buffer = await buildInvoicePdf(invoice, this.getSeller());
      return { buffer, invoice };
    }

    try {
      const buffer = await this.minio.getFileBuffer(invoice.pdfObjectKey);
      return { buffer, invoice };
    } catch {
      // Stored object missing/unreachable — fall back to regenerating from the DB record.
      const buffer = await buildInvoicePdf(invoice, this.getSeller());
      return { buffer, invoice };
    }
  }

  private async assertCanView(
    requester: { id: string; role: UserRole },
    invoice: Invoice,
  ) {
    if (requester.role === UserRole.SUPER_ADMIN) return;

    if (requester.role === UserRole.MODERATOR) {
      const profile = await this.prisma.moderatorProfile.findUnique({
        where: { userId: requester.id },
        select: { permissions: true },
      });
      if (profile?.permissions.includes(Permission.DASHBOARD_VIEW)) return;
      throw new ForbiddenException('Missing permission(s): VIEW_ANALYTICS');
    }

    if (invoice.billedToId === requester.id) return;

    if (requester.role === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: requester.id },
        select: { dealerUserId: true },
      });
      if (staffRecord?.dealerUserId === invoice.billedToId) return;
    }

    throw new ForbiddenException(
      'You do not have permission to view this invoice',
    );
  }
}
