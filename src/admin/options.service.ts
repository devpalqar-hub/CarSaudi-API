import { Injectable } from '@nestjs/common';
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

  getCarModels(search?: string) {
    return this.prisma.carModelOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createCarModel(dto: { title: string; image?: string }) {
    return this.prisma.carModelOption.create({ data: dto });
  }

  updateCarModel(id: string, dto: { title?: string; image?: string }) {
    return this.prisma.carModelOption.update({ where: { id }, data: dto });
  }

  deleteCarModel(id: string) {
    return this.prisma.carModelOption.delete({ where: { id } });
  }

  getCarBrands(search?: string) {
    return this.prisma.carBrandOption.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
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
