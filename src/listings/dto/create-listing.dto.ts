import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CarCondition,
  FuelType,
  ListingPurpose,
  TransmissionType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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
      'ID of a PENDING CarListingDraft (from a dealer bulk JSON/Excel/CSV upload) to create this ' +
      "listing from. The draft's parsed data is used as the base — any other fields you pass in this " +
      'request override it. When set, `title` / `purpose` / `modelId` / `brandId` / `price` below ' +
      "become optional since they're expected to come from the draft.",
    example: 'clxyzdraft123',
  })
  @IsOptional()
  @IsString()
  draftId?: string;

  // ── Core ──────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Listing title. Optional when `draftId` is provided.',
    example: '2022 Toyota Camry SE — Excellent Condition',
  })
  @ValidateIf((o) => !o.draftId)
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Title must be at least 5 characters' })
  title: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the car',
    example:
      'Single owner, accident-free, full service history, GCC spec, immaculate condition...',
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
    description: 'ID of the car model. Optional when `draftId` is provided.',
    example: 'cuid...',
  })
  @ValidateIf((o) => !o.draftId)
  @IsString()
  @IsNotEmpty()
  modelId: string;

  @ApiProperty({
    description: 'ID of the car brand. Optional when `draftId` is provided.',
    example: 'cuid...',
  })
  @ValidateIf((o) => !o.draftId)
  @IsString()
  @IsNotEmpty()
  brandId: string;

  // ── GPS ───────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Latitude coordinate (WGS-84)',
    example: 24.7136,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'Longitude coordinate (WGS-84)',
    example: 46.6753,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  // ── Common Car Details ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Year the car was manufactured',
    example: 2022,
    minimum: 1970,
    maximum: 2030,
  })
  @IsOptional()
  @IsInt()
  @Min(1970)
  @Max(2030)
  @Type(() => Number)
  modelYear?: number;

  @ApiPropertyOptional({
    description: 'Mileage driven, in kilometres',
    example: 35000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  mileage?: number;

  @ApiPropertyOptional({
    enum: TransmissionType,
    description: 'Transmission type',
    example: TransmissionType.AUTOMATIC,
  })
  @IsOptional()
  @IsEnum(TransmissionType)
  transmission?: TransmissionType;

  @ApiPropertyOptional({
    enum: FuelType,
    description: 'Fuel type',
    example: FuelType.PETROL,
  })
  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @ApiPropertyOptional({
    enum: CarCondition,
    description: 'Car condition',
    example: CarCondition.USED,
    default: CarCondition.USED,
  })
  @IsOptional()
  @IsEnum(CarCondition)
  condition?: CarCondition;

  @ApiPropertyOptional({
    description: 'Exterior (body) color',
    example: 'Pearl White',
  })
  @IsOptional()
  @IsString()
  exteriorColor?: string;

  @ApiPropertyOptional({
    description: 'Interior (upholstery) color',
    example: 'Beige',
  })
  @IsOptional()
  @IsString()
  interiorColor?: string;

  @ApiPropertyOptional({ description: 'Number of cylinders', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(16)
  @Type(() => Number)
  cylinders?: number;

  @ApiPropertyOptional({ description: 'Number of doors', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  @Type(() => Number)
  doors?: number;

  @ApiPropertyOptional({
    description: 'Vehicle Identification Number (VIN)',
    example: '1HGCM82633A004352',
  })
  @IsOptional()
  @IsString()
  vin?: string;

  @ApiPropertyOptional({
    description: 'ID of the car type (body style) — e.g. SUV, Sedan',
    example: 'cuid...',
  })
  @IsOptional()
  @IsString()
  carTypeId?: string;

  // ── Body-Type-Specific Extra Properties ──────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Extra fields specific to the car body type (JSON). ' +
      'SUV: { driveType, seatingCapacity, groundClearanceMm }. ' +
      'Sedan: { trunkCapacityLiters }. ' +
      'Pickup Truck: { bedLengthMeters, towingCapacityKg }. ' +
      'Van: { seatingCapacity, cargoVolumeLiters }. ' +
      'Convertible: { roofType }. ' +
      'Electric/Hybrid: { batteryRangeKm, chargeTimeHours }.',
    example: { driveType: '4WD', seatingCapacity: 7 },
  })
  @IsOptional()
  @IsObject()
  extraProperties?: Record<string, unknown>;

  // ── Price ─────────────────────────────────────────────────────────────────

  @ApiProperty({
    description: 'Price in SAR. Optional when `draftId` is provided.',
    example: 85000,
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

  // ── Saudi Arabia Address ─────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Address line 1 (street / landmark)',
    example: 'King Fahd Road',
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({
    description: 'Address line 2 (building / showroom number)',
    example: 'Showroom 12',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({
    description: 'Area / district name within Saudi Arabia',
    example: 'Al Olaya, Riyadh',
  })
  @IsOptional()
  @IsString()
  areaName?: string;

  // ── Contact ───────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Contact phone number (E.164 format)',
    example: '+966512345678',
  })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp number for inquiries (E.164 format)',
    example: '+966512345678',
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

  // ── Features ─────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'List of car feature IDs.',
    type: [String],
    example: ['cuid1', 'cuid2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  // ── Tags ─────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Car tag IDs (e.g. Single Owner, GCC Spec).',
    type: [String],
    example: ['cuid3', 'cuid4'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description:
      'Free-text notes on any other car features not listed above',
    example: 'Comes with an extended warranty transferable to the new owner',
  })
  @IsOptional()
  @IsString()
  otherFeatures?: string;

  // ── Photos ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'Car photos with sort order (max 30). sortOrder=0 is the hero image.',
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
        caption: 'Interior',
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
