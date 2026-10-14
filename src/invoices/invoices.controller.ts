import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QueryInvoiceDto } from './dto/query-invoice.dto';
import { InvoicesService } from './invoices.service';

// ─────────────────────────────────────────────────────────────────────────────
// One common invoice API for every role — USER, DEALER, DEALER_STAFF, MODERATOR,
// SUPER_ADMIN — each automatically scoped to what they're allowed to see:
//   USER / DEALER   → their own invoices
//   DEALER_STAFF    → their agency's (parent dealer's) invoices
//   MODERATOR       → all invoices, if granted the DASHBOARD_VIEW permission
//   SUPER_ADMIN     → all invoices, with an optional `userId` filter
// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @ApiOperation({
    summary: 'List my invoices / billing history',
    description:
      'Returns a paginated list of invoices — covers listing payments, featured-listing ' +
      'boosts, and dealer subscription plan purchases in one common shape. Scoped to the ' +
      "requester's own account (or their agency, for dealer staff); SUPER_ADMIN and " +
      "MODERATOR (with VIEW_ANALYTICS) can pass `userId` to view another account's invoices.",
  })
  @ApiResponse({ status: 200, description: 'Paginated invoice list' })
  list(@CurrentUser() user: any, @Query() query: QueryInvoiceDto) {
    return this.invoicesService.list(user, query);
  }

  @Get('by-reference/:referenceId')
  @ApiOperation({
    summary:
      'Get the invoice for a listing / featured boost / dealer subscription',
    description:
      'Same structured JSON as `GET /invoices/:id`, but looked up by the id of the thing the ' +
      'invoice documents — a Listing id, a FeaturedSubscription id, or a DealerSubscription id ' +
      '— so callers can go straight from e.g. a listing to its invoice without a prior lookup. ' +
      'Returns the most recent invoice if more than one exists for that reference.',
  })
  @ApiResponse({ status: 200, description: 'Invoice detail' })
  @ApiResponse({ status: 403, description: 'Not your invoice' })
  @ApiResponse({
    status: 404,
    description: 'No invoice found for this reference',
  })
  findByReference(
    @CurrentUser() user: any,
    @Param('referenceId') referenceId: string,
  ) {
    return this.invoicesService.findByReference(user, referenceId);
  }

  @Get('by-reference/:referenceId/download')
  @ApiOperation({
    summary:
      'Download the invoice for a listing / featured boost / dealer subscription',
    description:
      'Same Saudi Arabia-formatted PDF as `GET /invoices/:id/download`, but looked up by the id of ' +
      'the listing / featured boost / dealer subscription it documents — e.g. ' +
      "`GET /invoices/by-reference/{listingId}/download` to download a listing's invoice " +
      'directly.',
  })
  @ApiResponse({ status: 200, description: 'PDF file stream' })
  @ApiResponse({ status: 403, description: 'Not your invoice' })
  @ApiResponse({
    status: 404,
    description: 'No invoice found for this reference',
  })
  @Header('Content-Type', 'application/pdf')
  async downloadByReference(
    @CurrentUser() user: any,
    @Param('referenceId') referenceId: string,
  ): Promise<StreamableFile> {
    const { buffer, invoice } = await this.invoicesService.getPdfByReference(
      user,
      referenceId,
    );
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one invoice as structured JSON',
    description:
      'Returns the full invoice record (buyer/seller details, line items, VAT, totals) so ' +
      'the frontend can render its own custom receipt/invoice UI without needing the PDF.',
  })
  @ApiResponse({ status: 200, description: 'Invoice detail' })
  @ApiResponse({ status: 403, description: 'Not your invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.invoicesService.findOne(user, id);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Download the invoice as a Saudi Arabia-formatted PDF',
    description:
      'Streams the generated invoice/receipt PDF — same document emailed at the time the ' +
      'listing payment / featured boost / dealer subscription was completed.',
  })
  @ApiResponse({ status: 200, description: 'PDF file stream' })
  @ApiResponse({ status: 403, description: 'Not your invoice' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @Header('Content-Type', 'application/pdf')
  async download(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, invoice } = await this.invoicesService.getPdf(user, id);
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${invoice.invoiceNumber}.pdf"`,
    });
  }
}
