import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LISTING_SELECT } from '../listings/listings.service';

@Injectable()
export class WishlistsService {
  constructor(private readonly prisma: PrismaService) {}

  async toggleWishlist(userId: string, listingId: string) {
    const listing = await this.prisma.carListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const existing = await this.prisma.wishlist.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });

    if (existing) {
      await this.prisma.wishlist.delete({ where: { id: existing.id } });
      return { isWishlisted: false, message: 'Removed from wishlist' };
    } else {
      await this.prisma.wishlist.create({ data: { userId, listingId } });
      return { isWishlisted: true, message: 'Added to wishlist' };
    }
  }

  async getMyWishlists(userId: string) {
    const wishlists = await this.prisma.wishlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: LISTING_SELECT,
        },
      },
    });

    return wishlists.map((w) => ({
      ...w.listing,
      isWishlisted: true,
      wishlistedAt: w.createdAt,
    }));
  }
}
