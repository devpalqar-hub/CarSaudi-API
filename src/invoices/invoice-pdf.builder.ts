import PDFDocument from 'pdfkit';
import { Invoice } from '@prisma/client';
import * as fs from 'fs';
import { resolveAssetPath } from '../shared/asset-path.util';
import { InvoiceLineItem } from './invoice.types';

export interface InvoiceSeller {
  name: string;
  nameAr?: string;
  crNumber?: string;
  address: string;
  phone?: string;
  email?: string;
}

// Bundled brand assets — logoColor.png is the header logo, logo.png is the
// faint watermark stamped behind every invoice's content.
const LOGO_COLOR_PATH = resolveAssetPath('logoColor.png');
const WATERMARK_PATH = resolveAssetPath('logo.png');

// Brand color theme, sampled directly from logoColor.png's wordmark (maroon)
// and icon (gold) so the invoice matches the logo exactly.
const BRAND_PRIMARY = '#8a1538';
const BRAND_PRIMARY_TINT = '#f8eef1';
const BRAND_ACCENT = '#d39d55';

const QAR = (n: number) => `QAR ${n.toFixed(2)}`;

const TYPE_LABEL: Record<string, string> = {
  LISTING_PAYMENT: 'Listing Publication',
  FEATURED_LISTING: 'Featured Listing Boost',
  DEALER_SUBSCRIPTION: 'Dealer Subscription Plan',
};

/**
 * Renders a Qatar-standard invoice/receipt PDF — one common layout shared by all three
 * billable flows (listing payment, featured boost, dealer subscription). Amounts are shown
 * in QAR to 2 decimal places; a VAT line is always present (0% while Qatar has no general
 * VAT in effect) so the layout doesn't need to change if/when a rate is configured.
 */
export function buildInvoicePdf(
  invoice: Invoice,
  seller: InvoiceSeller,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lineItems = (invoice.lineItems as unknown as InvoiceLineItem[]) ?? [];
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Brand accent bar — the logo's maroon + gold, top edge of every page.
    doc.rect(0, 0, doc.page.width, 4).fill(BRAND_PRIMARY);
    doc.rect(0, 4, doc.page.width, 2).fill(BRAND_ACCENT);

    drawWatermark(doc);

    // ── Header — seller ─────────────────────────────────────────────────────
    // The logo already carries the "Villas Qatar" wordmark, so it's the sole
    // brand mark here — no duplicate text title alongside it.
    let headerTextY = 50;
    if (fs.existsSync(LOGO_COLOR_PATH)) {
      try {
        doc.image(LOGO_COLOR_PATH, 50, 45, { fit: [170, 48] });
        headerTextY = 45 + 48 + 10;
      } catch {
        // Ignore — header still renders fine without the logo image.
      }
    }

    doc.y = headerTextY;
    if (seller.nameAr) {
      doc
        .fillColor(BRAND_PRIMARY)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(seller.nameAr, 50, doc.y);
    }

    doc
      .fillColor('#333')
      .fontSize(9)
      .font('Helvetica')
      .text(seller.address, 50, doc.y)
      .text(
        [
          seller.crNumber ? `CR No: ${seller.crNumber}` : null,
          seller.phone,
          seller.email,
        ]
          .filter(Boolean)
          .join('   |   '),
      );

    // ── Invoice title + meta ────────────────────────────────────────────────
    doc.moveDown(1.2);
    const titleY = doc.y;
    doc
      .fillColor('#111')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(
        invoice.status === 'FREE'
          ? 'RECEIPT (NO CHARGE)'
          : 'TAX INVOICE / RECEIPT',
        50,
        titleY,
        {
          width: pageWidth,
          align: 'right',
        },
      );

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#555')
      .text(`Invoice No: ${invoice.invoiceNumber}`, {
        width: pageWidth,
        align: 'right',
      })
      .text(`Date: ${formatDate(invoice.createdAt)}`, {
        width: pageWidth,
        align: 'right',
      })
      .text(`Type: ${TYPE_LABEL[invoice.type] ?? invoice.type}`, {
        width: pageWidth,
        align: 'right',
      })
      .text(`Status: ${invoice.status}`, { width: pageWidth, align: 'right' });

    doc.moveDown(1.5);
    ruler(doc, pageWidth);

    // ── Bill To ──────────────────────────────────────────────────────────────
    doc.moveDown(0.8);
    doc.fillColor('#111').fontSize(10).font('Helvetica-Bold').text('BILL TO');
    doc.font('Helvetica').fontSize(10).fillColor('#333');
    if (invoice.billedToCompany) doc.text(invoice.billedToCompany);
    doc.text(invoice.billedToName);
    if (invoice.billedToTradeNumber)
      doc.text(`Trade License / CR: ${invoice.billedToTradeNumber}`);
    if (invoice.billedToAddress) doc.text(invoice.billedToAddress);
    if (invoice.billedToEmail) doc.text(invoice.billedToEmail);
    if (invoice.billedToPhone) doc.text(invoice.billedToPhone);

    doc.moveDown(0.8);
    doc
      .fillColor('#111')
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(invoice.description);

    // ── Line items table ─────────────────────────────────────────────────────
    doc.moveDown(1);
    const tableTop = doc.y;
    const col = {
      desc: 50,
      qty: 300,
      unit: 360,
      amount: 460,
    };
    const rowRight = 50 + pageWidth;

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
    doc.rect(50, tableTop, pageWidth, 20).fill(BRAND_PRIMARY);
    doc
      .fillColor('#fff')
      .text('Description', col.desc + 8, tableTop + 6)
      .text('Qty', col.qty, tableTop + 6, { width: 50, align: 'right' })
      .text('Unit Price', col.unit, tableTop + 6, { width: 90, align: 'right' })
      .text('Amount', col.amount, tableTop + 6, {
        width: rowRight - col.amount - 8,
        align: 'right',
      });

    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9.5).fillColor('#333');
    for (const [i, item] of lineItems.entries()) {
      const rowHeight = 20;
      if (i % 2 === 1) {
        doc.rect(50, y, pageWidth, rowHeight).fill(BRAND_PRIMARY_TINT);
        doc.fillColor('#333');
      }
      doc
        .text(item.description, col.desc + 8, y + 5, {
          width: col.qty - col.desc - 16,
        })
        .text(String(item.quantity), col.qty, y + 5, {
          width: 50,
          align: 'right',
        })
        .text(QAR(item.unitPrice), col.unit, y + 5, {
          width: 90,
          align: 'right',
        })
        .text(QAR(item.amount), col.amount, y + 5, {
          width: rowRight - col.amount - 8,
          align: 'right',
        });
      y += rowHeight;
    }

    doc.rect(50, tableTop, pageWidth, y - tableTop).stroke('#e0e0e0');

    // ── Totals ───────────────────────────────────────────────────────────────
    y += 12;
    const totalsLabelX = col.unit;
    const totalsWidth = rowRight - col.amount - 8;

    doc.font('Helvetica').fontSize(10).fillColor('#333');
    doc.text('Subtotal', totalsLabelX, y, { width: 90, align: 'right' });
    doc.text(QAR(invoice.subtotal), col.amount, y, {
      width: totalsWidth,
      align: 'right',
    });
    y += 16;

    doc.text(`VAT (${invoice.vatRate.toFixed(0)}%)`, totalsLabelX, y, {
      width: 90,
      align: 'right',
    });
    doc.text(QAR(invoice.vatAmount), col.amount, y, {
      width: totalsWidth,
      align: 'right',
    });
    y += 16;

    doc.moveTo(totalsLabelX, y).lineTo(rowRight, y).stroke('#ccc');
    y += 6;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND_PRIMARY);
    doc.text('Total Due', totalsLabelX, y, { width: 90, align: 'right' });
    doc.text(QAR(invoice.totalAmount), col.amount, y, {
      width: totalsWidth,
      align: 'right',
    });
    y += 24;

    doc.font('Helvetica').fontSize(9).fillColor('#555');
    doc.text(
      `Payment Method: ${invoice.status === 'FREE' ? 'N/A — no charge' : invoice.paymentMethod}`,
      50,
      y,
      {
        width: pageWidth,
      },
    );
    if (invoice.paidAt) {
      doc.text(`Paid On: ${formatDate(invoice.paidAt)}`, 50, doc.y);
    }
    doc.text(`Currency: ${invoice.currency}`, 50, doc.y);

    // ── Footer ───────────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor('#999');
    doc.text(
      'This is a system-generated invoice and is valid without a signature.',
      50,
      doc.page.height - 70,
      { width: pageWidth, align: 'center' },
    );
    doc.text(`${seller.name} — State of Qatar`, 50, doc.page.height - 58, {
      width: pageWidth,
      align: 'center',
    });

    doc.end();
  });
}

/** Stamps a faint, centered logo watermark behind the invoice content. */
function drawWatermark(doc: PDFKit.PDFDocument) {
  if (!fs.existsSync(WATERMARK_PATH)) return;
  try {
    const width = doc.page.width * 0.6;
    const height = width * (515 / 3000); // logo.png aspect ratio
    const x = (doc.page.width - width) / 2;
    const y = (doc.page.height - height) / 2;

    doc.save();
    doc.opacity(0.07);
    doc.image(WATERMARK_PATH, x, y, { width, height });
    doc.opacity(1);
    doc.restore();
  } catch {
    // Ignore — invoice still renders fine without the watermark.
  }
}

function ruler(doc: PDFKit.PDFDocument, width: number) {
  doc
    .moveTo(50, doc.y)
    .lineTo(50 + width, doc.y)
    .stroke('#e0e0e0');
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
