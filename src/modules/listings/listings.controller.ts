import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { QueryListingsDto } from './dto/query-listings.dto';
import { FlagListingDto } from './dto/flag-listing.dto';
import { ListingInquiryDto } from './dto/listing-inquiry.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  // ─── Public Endpoints ──────────────────────────────────

  @Get()
  @Public()
  @ApiOperation({ summary: 'Browse approved vehicle listings with filters' })
  @ApiResponse({ status: 200, description: 'Paginated listing results' })
  async findAll(@Query() query: QueryListingsDto) {
    return this.listingsService.findAllPublic(query);
  }

  @Get('featured')
  @Public()
  @ApiOperation({ summary: 'Get featured vehicle listings' })
  @ApiResponse({ status: 200, description: 'Featured listings' })
  async findFeatured(@Query() query: QueryListingsDto) {
    return this.listingsService.findAllPublic({
      ...query,
      isFeatured: 'true',
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get listing details (increments view count)' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing details' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const viewerId = (req as any).user?.id ?? null;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.listingsService.findOnePublic(id, viewerId, ipAddress, userAgent);
  }

  // ─── Authenticated User Endpoints ─────────────────────

  @Post()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a new vehicle listing (submitted for review)' })
  @ApiResponse({ status: 201, description: 'Listing created with PENDING_REVIEW status' })
  async create(
    @Body() dto: CreateListingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.listingsService.create(dto, userId);
  }

  @Get('my/listings')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get current user\'s own listings' })
  @ApiResponse({ status: 200, description: 'User\'s listings' })
  async findMyListings(
    @CurrentUser('id') userId: string,
    @Query() query: QueryListingsDto,
  ) {
    return this.listingsService.findMyListings(userId, query);
  }

  @Get(':id/analytics')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'View performance analytics for own listing' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing analytics data' })
  async getAnalytics(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.listingsService.getListingAnalytics(id, userId);
  }

  @Patch(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update own listing (resets to PENDING_REVIEW if was approved)' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing updated' })
  @ApiResponse({ status: 403, description: 'Not the listing owner' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateListingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.listingsService.update(id, dto, userId);
  }

  @Delete(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Soft-delete own listing' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 200, description: 'Listing deleted' })
  @ApiResponse({ status: 403, description: 'Not the listing owner' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.listingsService.softDelete(id, userId);
  }

  @Post(':id/flag')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Flag a listing as misleading, fraudulent, etc.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 201, description: 'Listing flagged' })
  @ApiResponse({ status: 400, description: 'Already flagged or own listing' })
  async flag(
    @Param('id') id: string,
    @Body() dto: FlagListingDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.listingsService.flagListing(id, dto, userId);
  }

  @Post(':id/inquire')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Submit an inquiry on a listing' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({ status: 201, description: 'Inquiry submitted' })
  async inquire(
    @Param('id') id: string,
    @Body() dto: ListingInquiryDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.listingsService.submitInquiry(id, dto, userId);
  }
}
