import { Injectable } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchAutocompleteDto } from './dto/search-autocomplete.dto';

const CAR_SEARCH_MIN_LENGTH = 3;
const PLACE_RESULTS_LIMIT = 5;
const CAR_RESULTS_LIMIT = 5;

export interface PlaceResult {
  type: 'place';
  name: string;
  location: { latitude: number; longitude: number };
}

export interface CarResult {
  type: 'car';
  title: string;
  slug: string | null;
}

interface MapboxFeature {
  place_name?: string;
  text?: string;
  center?: [number, number];
}

interface MapboxGeocodingResponse {
  features?: MapboxFeature[];
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async autocomplete(dto: SearchAutocompleteDto) {
    const query = dto.q.trim();
    if (!query) {
      return { query, results: [] };
    }

    const [places, cars] = await Promise.all([
      this.searchPlaces(query),
      query.length > CAR_SEARCH_MIN_LENGTH
        ? this.searchCars(query)
        : Promise.resolve([]),
    ]);

    return {
      query,
      results: [...places, ...cars],
    };
  }

  // ─── Location search (Mapbox Geocoding API, Saudi Arabia only) ─────────────

  private async searchPlaces(query: string): Promise<PlaceResult[]> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      return [];
    }

    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${accessToken}&country=sa&autocomplete=true&limit=${PLACE_RESULTS_LIMIT}`;
      const res = await fetch(url);
      const data = (await res.json()) as MapboxGeocodingResponse;

      // `country=sa` above already restricts results to Saudi Arabia
      const features = Array.isArray(data.features) ? data.features : [];
      return features
        .map((feature): PlaceResult => ({
          type: 'place',
          name: feature.place_name ?? feature.text ?? '',
          location: {
            latitude: feature.center?.[1] as number,
            longitude: feature.center?.[0] as number,
          },
        }))
        .filter(
          (place) =>
            typeof place.location.latitude === 'number' &&
            typeof place.location.longitude === 'number',
        );
    } catch {
      // Silently ignore network/API errors — location suggestions are best-effort
      return [];
    }
  }

  // ─── Car search (title / description / keyword) ────────────────────────────

  private async searchCars(query: string): Promise<CarResult[]> {
    const listings = await this.prisma.carListing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { areaName: { contains: query, mode: 'insensitive' } },
          { addressLine1: { contains: query, mode: 'insensitive' } },
          { referenceCode: { contains: query, mode: 'insensitive' } },
          { otherFeatures: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        title: true,
        slug: true,
      },
      take: CAR_RESULTS_LIMIT,
      orderBy: { createdAt: 'desc' },
    });

    return listings.map((listing) => ({
      type: 'car' as const,
      title: listing.title,
      slug: listing.slug,
    }));
  }
}
