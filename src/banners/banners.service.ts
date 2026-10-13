import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { QueryBannerDto } from './dto/query-banner.dto';

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: dto,
    });
  }

  async findAllPublic(query: QueryBannerDto) {
    const now = new Date();

    // Only return active banners, and honor start/end dates if they are set
    return this.prisma.banner.findMany({
      where: {
        isActive: true,
        ...(query.isFeatured !== undefined && { isFeatured: query.isFeatured }),
        ...(query.search
          ? { title: { contains: query.search, mode: 'insensitive' } }
          : {}),
        AND: [
          {
            OR: [{ startDate: null }, { startDate: { lte: now } }],
          },
          {
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
        ],
      },
      orderBy: { position: 'asc' },
    });
  }

  async findAllAdmin(search?: string) {
    return this.prisma.banner.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
    });
    if (!banner) {
      throw new NotFoundException('Banner not found');
    }
    return banner;
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id); // Ensure it exists
    return this.prisma.banner.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Ensure it exists
    return this.prisma.banner.delete({
      where: { id },
    });
  }
}
