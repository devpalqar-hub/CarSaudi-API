import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OptionsService {
  constructor(private readonly prisma: PrismaService) {}

  getAmenities(search?: string) {
    return this.prisma.amenityOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createAmenity(dto: { title: string; image?: string }) {
    return this.prisma.amenityOption.create({ data: dto });
  }

  updateAmenity(id: string, dto: { title?: string; image?: string }) {
    return this.prisma.amenityOption.update({ where: { id }, data: dto });
  }

  deleteAmenity(id: string) {
    return this.prisma.amenityOption.delete({ where: { id } });
  }

  getNearbyTags(search?: string) {
    return this.prisma.nearbyTagOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createNearbyTag(dto: { title: string; image?: string }) {
    return this.prisma.nearbyTagOption.create({ data: dto });
  }

  updateNearbyTag(id: string, dto: { title?: string; image?: string }) {
    return this.prisma.nearbyTagOption.update({ where: { id }, data: dto });
  }

  deleteNearbyTag(id: string) {
    return this.prisma.nearbyTagOption.delete({ where: { id } });
  }

  getFurnishingOptions(search?: string) {
    return this.prisma.furnishingOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createFurnishingOption(dto: { title: string }) {
    return this.prisma.furnishingOption.create({ data: dto });
  }

  updateFurnishingOption(id: string, dto: { title?: string }) {
    return this.prisma.furnishingOption.update({ where: { id }, data: dto });
  }

  deleteFurnishingOption(id: string) {
    return this.prisma.furnishingOption.delete({ where: { id } });
  }

  getListingTypes(search?: string) {
    return this.prisma.listingTypeOption.findMany({
      where: search
        ? { title: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createListingType(dto: { title: string; image?: string }) {
    return this.prisma.listingTypeOption.create({ data: dto });
  }

  updateListingType(id: string, dto: { title?: string; image?: string }) {
    return this.prisma.listingTypeOption.update({ where: { id }, data: dto });
  }

  deleteListingType(id: string) {
    return this.prisma.listingTypeOption.delete({ where: { id } });
  }
  getMunicipalities(search?: string) {
    return this.prisma.municipalityOption.findMany({
      where: search
        ? { name: { contains: search, mode: 'insensitive' } }
        : undefined,
    });
  }

  createMunicipality(dto: {
    name: string;
    image?: string;
    latitude?: number;
    longitude?: number;
    isPopular?: boolean;
    isActive?: boolean;
  }) {
    return this.prisma.municipalityOption.create({ data: dto });
  }

  updateMunicipality(
    id: string,
    dto: {
      name?: string;
      image?: string;
      latitude?: number;
      longitude?: number;
      isPopular?: boolean;
      isActive?: boolean;
    },
  ) {
    return this.prisma.municipalityOption.update({ where: { id }, data: dto });
  }

  deleteMunicipality(id: string) {
    return this.prisma.municipalityOption.delete({ where: { id } });
  }
}
