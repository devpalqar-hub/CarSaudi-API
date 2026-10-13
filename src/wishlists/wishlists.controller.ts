import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WishlistsService } from './wishlists.service';

@ApiTags('Wishlists')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
@Controller('wishlists')
export class WishlistsController {
  constructor(private readonly wishlistsService: WishlistsService) {}

  @Post(':listingId')
  @ApiOperation({ summary: 'Toggle a listing in the wishlist' })
  @ApiParam({ name: 'listingId', description: 'Listing ID to toggle' })
  @ApiResponse({ status: 200, description: 'Wishlist toggled successfully' })
  toggleWishlist(
    @CurrentUser('id') userId: string,
    @Param('listingId') listingId: string,
  ) {
    return this.wishlistsService.toggleWishlist(userId, listingId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all wishlisted listings for the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of wishlisted properties with full details',
  })
  getMyWishlists(@CurrentUser('id') userId: string) {
    return this.wishlistsService.getMyWishlists(userId);
  }
}
