import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingPurpose } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsJSON,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ListingPhotoDto } from './listing-photo.dto';

export class CreateListingDto {
  // ── Bulk-upload draft ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'ID of a PENDING ListingDraft (from a dealer bulk JSON/Excel/CSV upload) to create this listing ' +
      "from. The draft's parsed data is used as the base — any other fields you pass in this request " +
      'override it. When set, `propertyName` / `purpose` / `typeId` / `price` below become optional ' +
      "since they're expected to come from the draft.",
    example: 'clxyzdraft123',
  })
  @IsOptional()
  @IsString()
  draftId?: string;

  // ── Core ──────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Property name / title. Optional when `draftId` is provided.',
    example: 'Luxury 4-BR Villa in The Pearl Qatar',
  })
  @ValidateIf((o) => !o.draftId)
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Property name must be at least 5 characters' })
  propertyName: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the property',
    example:
      'Stunning 4-bedroom villa with private pool, sea view, and fully landscaped garden...',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description:
      'Listing purpose — for sale or for rent. Optional when `draftId` is provided.',
    enum: ListingPurpose,
    example: ListingPurpose.SALE,
  })
  @ValidateIf((o) => !o.draftId)
  @IsEnum(ListingPurpose, { message: 'Purpose must be SALE or RENT' })
  purpose: ListingPurpose;

  @ApiProperty({
    description:
      'ID of the property type category. Optional when `draftId` is provided.',
    example: 'cuid...',
  })
  @ValidateIf((o) => !o.draftId)
  @IsString()
  @IsNotEmpty()
  typeId: string;

  // ── GPS ───────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Latitude coordinate (WGS-84)',
    example: 25.3548,
  })
  @IsOptional()
  @IsLatitude()
  @Type(() => Number)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate (WGS-84)',
    example: 51.1839,
  })
  @IsOptional()
  @IsLongitude()
  @Type(() => Number)
  longitude?: number;

  // ── Common Property Details ───────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Number of bedrooms (0 = studio)',
    example: 4,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  bedrooms?: number;

  @ApiPropertyOptional({
    description: 'Number of bathrooms',
    example: 3,
    minimum: 0,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  @Type(() => Number)
  bathrooms?: number;

  @ApiPropertyOptional({
    description: 'Total built-up area in square metres',
    example: 450.5,
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  area?: number;

  @ApiPropertyOptional({
    description: 'Number of living / reception rooms',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  @Type(() => Number)
  livingRooms?: number;

  @ApiPropertyOptional({ description: 'Number of parking spaces', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  @Type(() => Number)
  parkingSpaces?: number;

  @ApiPropertyOptional({
    description: 'Floor number in the building',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  floorNumber?: number;

  @ApiPropertyOptional({
    description: 'Total number of floors in the building',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  totalFloors?: number;

  @ApiPropertyOptional({
    description: 'Year the property was built',
    example: 2019,
  })
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2030)
  @Type(() => Number)
  yearBuilt?: number;

  @ApiPropertyOptional({
    description: 'ID of the furnishing status of the property',
    example: 'cuid...',
  })
  @IsOptional()
  @IsString()
  furnishingId?: string;

  // ── Type-Specific Extra Properties ───────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Extra fields specific to the property type (JSON). ' +
      'Villa: { gardenAreaSqm, privatePool, privateGym, driverRoom, outdoorKitchen, rooftopTerrace, numberOfFloors }. ' +
      'Apartment: { viewType, buildingName, serviceChargePerSqm, chillersIncluded }. ' +
      'Townhouse: { gardenAreaSqm, rooftopTerrace, basement, backyard }. ' +
      'Penthouse: { privateTerraceSqm, privatePool, skyLounge, doubleHeight }. ' +
      'Studio: { loftStyle, mezzanineLevel, openPlanKitchen }. ' +
      'Commercial: { officeGrade, numberOfUnits, annualServiceCharge, zoningType, fitOutStatus, floorPlate }. ' +
      'Land: { plotAreaSqm, roadFrontageMeters, zoningType, buildPermitAvailable, utilityConnected, cornerPlot }.',
    example: { privatePool: true, gardenAreaSqm: 200 },
  })
  @IsOptional()
  @IsObject()
  extraProperties?: Record<string, unknown>;

  // ── Price ─────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Price in QAR. Optional when `draftId` is provided.',
    example: 5500000,
    minimum: 0,
  })
  @ValidateIf((o) => !o.draftId)
  @IsNumber()
  @IsPositive({ message: 'Price must be a positive number' })
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({
    description: 'Indicates if the price is negotiable',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  priceNegotiable?: boolean;

  // ── Qatar Address ─────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Address line 1 (street / building)',
    example: 'Porto Arabia Tower 5',
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({
    description: 'Address line 2 (apartment / unit number)',
    example: 'Apt 1201',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({
    description: 'Area / district name within Qatar',
    example: 'The Pearl Qatar',
  })
  @IsOptional()
  @IsString()
  areaName?: string;

  @ApiPropertyOptional({
    description: 'ID of the Qatar municipality',
    example: 'cuid...',
  })
  @IsOptional()
  @IsString()
  municipalityId?: string;

  // ── Contact ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Contact phone number (E.164 format)',
    example: '+97455512345',
  })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp number for inquiries (E.164 format)',
    example: '+97455512345',
  })
  @IsOptional()
  @IsString()
  contactWhatsapp?: string;

  @ApiPropertyOptional({
    description: 'Whether the contact details have been verified by admin',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  contactVerified?: boolean;

  // ── Amenities ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'List of amenity IDs.',
    type: [String],
    example: ['cuid1', 'cuid2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  // ── Nearby Tags ───────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Nearby landmark tag IDs.',
    type: [String],
    example: ['cuid3', 'cuid4'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  nearbyTags?: string[];

  @ApiPropertyOptional({
    description:
      'Free-text notes on any other property features not listed above',
    example: 'Comes with a dedicated boat berth in the marina',
  })
  @IsOptional()
  @IsString()
  otherFeatures?: string;

  // ── Photos ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Property photos with sort order (max 30). sortOrder=0 is the hero image.',
    type: [ListingPhotoDto],
    example: [
      {
        url: 'https://cdn.example.com/photo1.jpg',
        sortOrder: 0,
        caption: 'Front View',
      },
      {
        url: 'https://cdn.example.com/photo2.jpg',
        sortOrder: 1,
        caption: 'Living Room',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30, { message: 'Maximum 30 photos allowed per listing' })
  @ValidateNested({ each: true })
  @Type(() => ListingPhotoDto)
  photos?: ListingPhotoDto[];
}
