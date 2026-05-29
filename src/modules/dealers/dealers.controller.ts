import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DealersService } from './dealers.service';
import { ApplyDealerDto } from './dto/apply-dealer.dto';
import { UpdateDealerDto } from './dto/update-dealer.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Dealers')
@Controller('dealers')
export class DealersController {
  constructor(private readonly dealersService: DealersService) {}

  // ─── Public Endpoints ──────────────────────────────────

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'View dealer public profile' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiResponse({ status: 200, description: 'Dealer public profile' })
  @ApiResponse({ status: 404, description: 'Dealer not found' })
  async findOne(@Param('id') id: string) {
    return this.dealersService.findOnePublic(id);
  }

  @Get(':id/listings')
  @Public()
  @ApiOperation({ summary: 'Browse dealer\'s approved vehicle listings' })
  @ApiParam({ name: 'id', description: 'Dealer UUID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Dealer listings' })
  async findDealerListings(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.dealersService.findDealerListings(id, {
      page: page ? +page : 1,
      limit: limit ? +limit : 10,
    });
  }

  // ─── Authenticated User Endpoints ─────────────────────

  @Post('apply')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Submit a dealer application (any authenticated user)' })
  @ApiResponse({ status: 201, description: 'Dealer application submitted' })
  @ApiResponse({ status: 409, description: 'Already has a dealer profile' })
  async apply(
    @Body() dto: ApplyDealerDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.dealersService.apply(dto, userId);
  }

  @Get('my/profile')
  @ApiBearerAuth('bearer')
  @Roles('DEALER')
  @ApiOperation({ summary: 'Get own dealer profile' })
  @ApiResponse({ status: 200, description: 'Dealer profile' })
  async getMyProfile(@CurrentUser('id') userId: string) {
    return this.dealersService.getMyProfile(userId);
  }

  @Patch('my/profile')
  @ApiBearerAuth('bearer')
  @Roles('DEALER')
  @ApiOperation({ summary: 'Update own dealer profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateDealerDto,
  ) {
    return this.dealersService.updateMyProfile(userId, dto);
  }

  @Get('my/analytics')
  @ApiBearerAuth('bearer')
  @Roles('DEALER')
  @ApiOperation({ summary: 'View own dealer performance analytics' })
  @ApiResponse({ status: 200, description: 'Dealer analytics' })
  async getMyAnalytics(@CurrentUser('id') userId: string) {
    return this.dealersService.getMyAnalytics(userId);
  }
}
