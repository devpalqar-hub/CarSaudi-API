import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OptionsService {
  constructor(private readonly prisma: PrismaService) {}

  getCarFeatures(search?: string) {
    return this.prisma.carFeatureOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createCarFeature(dto: { title: string; image?: string }) {
    return this.prisma.carFeatureOption.create({ data: dto });
  }

  updateCarFeature(id: string, dto: { title?: string; image?: string }) {
    return this.prisma.carFeatureOption.update({ where: { id }, data: dto });
  }

  deleteCarFeature(id: string) {
    return this.prisma.carFeatureOption.delete({ where: { id } });
  }

  getCarTags(search?: string) {
    return this.prisma.carTagOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createCarTag(dto: { title: string; image?: string }) {
    return this.prisma.carTagOption.create({ data: dto });
  }

  updateCarTag(id: string, dto: { title?: string; image?: string }) {
    return this.prisma.carTagOption.update({ where: { id }, data: dto });
  }

  deleteCarTag(id: string) {
    return this.prisma.carTagOption.delete({ where: { id } });
  }

  getCarTypes(search?: string) {
    return this.prisma.carTypeOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createCarType(dto: { title: string }) {
    return this.prisma.carTypeOption.create({ data: dto });
  }

  updateCarType(id: string, dto: { title?: string }) {
    return this.prisma.carTypeOption.update({ where: { id }, data: dto });
  }

  deleteCarType(id: string) {
    return this.prisma.carTypeOption.delete({ where: { id } });
  }

  getCarModels(search?: string, brandId?: string) {
    return this.prisma.carModelOption.findMany({
      where: {
        ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
        ...(brandId ? { brandId } : {}),
      },
      include: {
        brand: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
      orderBy: { title: 'asc' },
    });
  }

  async createCarModel(dto: { title: string; brandId: string; image?: string }) {
    const brand = await this.prisma.carBrandOption.findUnique({
      where: { id: dto.brandId },
      select: { id: true },
    });
    if (!brand) {
      throw new NotFoundException(`Car brand with ID "${dto.brandId}" not found`);
    }
    return this.prisma.carModelOption.create({
      data: dto,
      include: {
        brand: {
          select: { id: true, name: true, image: true },
        },
      },
    });
  }

  async updateCarModel(
    id: string,
    dto: { title?: string; brandId?: string; image?: string },
  ) {
    if (dto.brandId) {
      const brand = await this.prisma.carBrandOption.findUnique({
        where: { id: dto.brandId },
        select: { id: true },
      });
      if (!brand) {
        throw new NotFoundException(`Car brand with ID "${dto.brandId}" not found`);
      }
    }
    return this.prisma.carModelOption.update({
      where: { id },
      data: dto,
      include: {
        brand: {
          select: { id: true, name: true, image: true },
        },
      },
    });
  }

  deleteCarModel(id: string) {
    return this.prisma.carModelOption.delete({ where: { id } });
  }

  getCarBrands(search?: string) {
    return this.prisma.carBrandOption.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
      include: {
        _count: {
          select: {
            models: true,
            listings: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  createCarBrand(dto: {
    name: string;
    image?: string;
    isPopular?: boolean;
    isActive?: boolean;
  }) {
    return this.prisma.carBrandOption.create({ data: dto });
  }

  updateCarBrand(
    id: string,
    dto: {
      name?: string;
      image?: string;
      isPopular?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.prisma.carBrandOption.update({ where: { id }, data: dto });
  }

  deleteCarBrand(id: string) {
    return this.prisma.carBrandOption.delete({ where: { id } });
  }
}
