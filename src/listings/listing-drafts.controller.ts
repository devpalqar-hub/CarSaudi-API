import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListingDraftsService } from './listing-drafts.service';
import { QueryListingDraftsDto } from './dto/query-listing-drafts.dto';

const ALLOWED_MIME_HINTS = ['json', 'csv', 'sheet', 'excel'];

@ApiTags('Listings — Bulk Upload (Dealer)')
@Controller('listings')
export class ListingDraftsController {
  constructor(private readonly listingDraftsService: ListingDraftsService) {}

  // ─── Downloadable template ──────────────────────────────────────────────────

  @Get('bulk-upload/template')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="listing-bulk-upload-template.xlsx"',
  )
  @ApiOperation({
    summary: 'Dealer: Download the bulk-upload Excel template',
    description:
      'One header row + one example row covering every supported column, incl. `features` / ' +
      '`tags` (comma-separated titles or IDs), `model` / `brand` / `carType` (title or ' +
      'ID), `extraProperties` (JSON string), and `photos` (comma-separated image URLs). ' +
      'A CSV upload uses the exact same column headers.',
  })
  @ApiResponse({ status: 200, description: 'Excel (.xlsx) template file' })
  downloadTemplate() {
    return new StreamableFile(this.listingDraftsService.getTemplateBuffer());
  }

  // ─── Bulk upload ────────────────────────────────────────────────────────────

  @Post('bulk-upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, cb) => {
        const name = (file.originalname ?? '').toLowerCase();
        const okExt = ['.json', '.csv', '.xlsx', '.xls'].some((ext) =>
          name.endsWith(ext),
        );
        const okMime = ALLOWED_MIME_HINTS.some((hint) =>
          file.mimetype?.includes(hint),
        );
        if (!okExt && !okMime) {
          return cb(
            new BadRequestException(
              'Only .json, .csv, .xlsx, or .xls files are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({
    summary:
      'Dealer: Bulk-upload listings from JSON, Excel, or CSV (max 500 rows, max 10 MB)',
    description:
      'Parses the file and saves every row as a `CarListingDraft` — nothing is published yet. Each row is ' +
      'normalized to match the listing creation shape (`model`/`brand`/`carType`/`features`/ ' +
      '`tags` resolved by ID or title, `photos` split from a comma-separated URL list) and ' +
      'validated; rows with problems are still saved with an `errors` array so the dealer can review ' +
      'and fix them before creating. Get the column layout via ' +
      '`GET /listings/bulk-upload/template`. Callable by a dealer or their staff — drafts belong to ' +
      'the dealer agency either way. Use the returned draft `id`s with `POST /listings { draftId }` to ' +
      'create real listings for review.',
  })
  @ApiResponse({
    status: 201,
    description: 'Drafts created — summary + per-row validation results',
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported/invalid file, or too many rows',
  })
  bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    if (!file) throw new BadRequestException('A file is required');
    return this.listingDraftsService.bulkUpload(file, userId, userRole);
  }

  // ─── List / get / discard drafts ────────────────────────────────────────────

  @Get('drafts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: "Dealer: List the agency's bulk-upload drafts",
    description:
      'Optionally filter by `batchId` (one upload) or `status` (PENDING / USED / DISCARDED).',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of drafts' })
  listDrafts(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
    @Query() query: QueryListingDraftsDto,
  ) {
    return this.listingDraftsService.listDrafts(userId, userRole, query);
  }

  @Get('drafts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer: Get one draft (full parsed data + validation errors)',
  })
  @ApiParam({ name: 'id', description: 'Draft CUID' })
  @ApiResponse({ status: 200, description: 'Draft detail' })
  @ApiResponse({ status: 404, description: 'Draft not found' })
  getDraft(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.listingDraftsService.getDraft(id, userId, userRole);
  }

  @Delete('drafts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DEALER, UserRole.DEALER_STAFF)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Dealer: Discard a draft',
    description:
      'Only PENDING drafts can be discarded (one already used to create a listing cannot be).',
  })
  @ApiParam({ name: 'id', description: 'Draft CUID' })
  @ApiResponse({ status: 200, description: 'Draft discarded' })
  @ApiResponse({ status: 400, description: 'Draft is not PENDING' })
  @ApiResponse({ status: 404, description: 'Draft not found' })
  discardDraft(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: UserRole,
  ) {
    return this.listingDraftsService.discardDraft(id, userId, userRole);
  }
}
