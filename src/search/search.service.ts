import { Injectable } from '@nestjs/common';
import { ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SearchAutocompleteDto } from './dto/search-autocomplete.dto';

const PROPERTY_SEARCH_MIN_LENGTH = 3;
const PLACE_RESULTS_LIMIT = 5;
const PROPERTY_RESULTS_LIMIT = 5;

export interface PlaceResult {
  type: 'place';
  name: string;
  location: { latitude: number; longitude: number };
}

export interface PropertyResult {
  type: 'property';
  propertyName: string;
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

    const [places, properties] = await Promise.all([
      this.searchPlaces(query),
      query.length > PROPERTY_SEARCH_MIN_LENGTH
        ? this.searchProperties(query)
        : Promise.resolve([]),
    ]);

    return {
      query,
      results: [...places, ...properties],
    };
  }

  // ─── Location search (Mapbox Geocoding API, Qatar only) ────────────────────

  private async searchPlaces(query: string): Promise<PlaceResult[]> {
    const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      return [];
    }

    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
        `?access_token=${accessToken}&country=qa&autocomplete=true&limit=${PLACE_RESULTS_LIMIT}`;
      const res = await fetch(url);
      const data = (await res.json()) as MapboxGeocodingResponse;

      // `country=qa` above already restricts results to Qatar
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

  // ─── Property search (name / description / keyword) ────────────────────────

  private async searchProperties(query: string): Promise<PropertyResult[]> {
    const listings = await this.prisma.listing.findMany({
      where: {
        status: ListingStatus.ACTIVE,
        OR: [
          { propertyName: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { areaName: { contains: query, mode: 'insensitive' } },
          { addressLine1: { contains: query, mode: 'insensitive' } },
          { referenceCode: { contains: query, mode: 'insensitive' } },
          { otherFeatures: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        propertyName: true,
        slug: true,
      },
      take: PROPERTY_RESULTS_LIMIT,
      orderBy: { createdAt: 'desc' },
    });

    return listings.map((listing) => ({
      type: 'property' as const,
      propertyName: listing.propertyName,
      slug: listing.slug,
    }));
  }
}
