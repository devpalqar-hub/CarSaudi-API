import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHeroBannerDto } from './dto/create-hero-banner.dto';
import { UpdateHeroBannerDto } from './dto/update-hero-banner.dto';

@Injectable()
export class HeroBannersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateHeroBannerDto) {
    return this.prisma.heroBanner.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.heroBanner.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const heroBanner = await this.prisma.heroBanner.findUnique({
      where: { id },
    });
    if (!heroBanner) {
      throw new NotFoundException('Hero banner not found');
    }
    return heroBanner;
  }

  async update(id: string, dto: UpdateHeroBannerDto) {
    await this.findOne(id); // Ensure it exists
    return this.prisma.heroBanner.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // Ensure it exists
    return this.prisma.heroBanner.delete({
      where: { id },
    });
  }
}
