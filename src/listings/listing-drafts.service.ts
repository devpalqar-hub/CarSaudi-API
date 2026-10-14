import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CarCondition,
  CarListingDraftStatus,
  CarListingDraftSource,
  FuelType,
  ListingPurpose,
  TransmissionType,
  UserRole,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { QueryListingDraftsDto } from './dto/query-listing-drafts.dto';

/** One parsed + validated row, ready to be stored as a CarListingDraft */
interface ParsedRow {
  rowNumber: number;
  data: Record<string, unknown>;
  errors: string[];
}

/** Splits a delimited cell value ("a, b | c") into a trimmed, non-empty string array */
function splitList(value: unknown): string[] {
  if (value === null || value === undefined || value === '') return [];
  return String(value)
    .split(/[,|;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return undefined;
}

/** Column headers accepted for the Excel/CSV template (case-insensitive, order shown in the download template) */
export const BULK_UPLOAD_COLUMNS = [
  'title',
  'description',
  'purpose',
  'model',
  'brand',
  'price',
  'priceNegotiable',
  'modelYear',
  'mileage',
  'transmission',
  'fuelType',
  'condition',
  'exteriorColor',
  'interiorColor',
  'cylinders',
  'doors',
  'vin',
  'carType',
  'addressLine1',
  'addressLine2',
  'areaName',
  'contactPhone',
  'contactWhatsapp',
  'features',
  'tags',
  'otherFeatures',
  'latitude',
  'longitude',
  'extraProperties',
  'photos',
] as const;

const EXAMPLE_ROW: Record<(typeof BULK_UPLOAD_COLUMNS)[number], string> = {
  title: '2022 Toyota Camry SE — Excellent Condition',
  description: 'Single owner, accident-free, full service history',
  purpose: 'SALE',
  model: 'Camry',
  brand: 'Toyota',
  price: '85000',
  priceNegotiable: 'false',
  modelYear: '2022',
  mileage: '35000',
  transmission: 'AUTOMATIC',
  fuelType: 'PETROL',
  condition: 'USED',
  exteriorColor: 'Pearl White',
  interiorColor: 'Beige',
  cylinders: '4',
  doors: '4',
  vin: '',
  carType: 'Sedan',
  addressLine1: 'King Fahd Road',
  addressLine2: '',
  areaName: 'Al Olaya, Riyadh',
  contactPhone: '+966512345678',
  contactWhatsapp: '+966512345678',
  features: 'Sunroof, Leather Seats, Navigation System',
  tags: 'Single Owner, Accident-Free, GCC Spec',
  otherFeatures: 'Comes with an extended warranty',
  latitude: '24.7136',
  longitude: '46.6753',
  extraProperties: '{"driveType": "FWD"}',
  photos:
    'https://cdn.example.com/photo1.jpg, https://cdn.example.com/photo2.jpg',
};

@Injectable()
export class ListingDraftsService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Agency resolution
  // ────────────────────────────────────────────────────────────────────────────

  /** Returns the dealerUserId owning the agency for this requester (self if DEALER, parent if DEALER_STAFF). */
  private async resolveAgencyUserId(
    userId: string,
    role: UserRole | undefined,
  ): Promise<string> {
    if (role === UserRole.DEALER) return userId;
    if (role === UserRole.DEALER_STAFF) {
      const staffRecord = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: userId },
        select: { dealerUserId: true, isActive: true },
      });
      if (!staffRecord?.isActive) {
        throw new ForbiddenException('Your staff account is inactive');
      }
      return staffRecord.dealerUserId;
    }
    throw new ForbiddenException(
      'Only dealers or dealer staff can use bulk listing upload',
    );
  }

  private async assertSameAgency(dealerUserId: string, requesterId: string) {
    if (dealerUserId === requesterId) return;
    const staffRecord = await this.prisma.dealerStaff.findUnique({
      where: { staffUserId: requesterId },
      select: { dealerUserId: true, isActive: true },
    });
    if (staffRecord?.isActive && staffRecord.dealerUserId === dealerUserId)
      return;
    throw new ForbiddenException('You do not have access to this draft');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Bulk upload (JSON / Excel / CSV)
  // ────────────────────────────────────────────────────────────────────────────

  async bulkUpload(
    file: Express.Multer.File,
    userId: string,
    role: UserRole | undefined,
  ) {
    if (!file) throw new BadRequestException('A file is required');

    const dealerUserId = await this.resolveAgencyUserId(userId, role);
    const { source, rows: rawRows } = this.parseFile(file);

    if (rawRows.length === 0) {
      throw new BadRequestException('No rows found in the uploaded file');
    }
    if (rawRows.length > 500) {
      throw new BadRequestException(
        'Maximum 500 rows per upload — split into multiple files',
      );
    }

    const lookups = await this.loadReferenceLookups();
    const parsedRows = rawRows.map((row, i) =>
      this.normalizeRow(row, i + 1, lookups),
    );

    const batchId = uuidv4();
    const drafts = await Promise.all(
      parsedRows.map((row) =>
        this.prisma.carListingDraft.create({
          data: {
            batchId,
            source,
            rowNumber: row.rowNumber,
            dealerUserId,
            createdById: userId,
            data: row.data as any,
            errors: row.errors,
          },
        }),
      ),
    );

    const validCount = parsedRows.filter((r) => r.errors.length === 0).length;

    return {
      batchId,
      source,
      totalRows: drafts.length,
      validRows: validCount,
      invalidRows: drafts.length - validCount,
      drafts: drafts.map((d, i) => ({
        id: d.id,
        rowNumber: d.rowNumber,
        isValid: parsedRows[i].errors.length === 0,
        errors: parsedRows[i].errors,
        data: d.data,
      })),
    };
  }

  /** Detects format from mimetype/extension and returns raw parsed rows as plain objects. */
  private parseFile(file: Express.Multer.File): {
    source: CarListingDraftSource;
    rows: Record<string, unknown>[];
  } {
    const name = (file.originalname ?? '').toLowerCase();
    const mimetype = file.mimetype ?? '';

    if (name.endsWith('.json') || mimetype.includes('json')) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(file.buffer.toString('utf-8'));
      } catch {
        throw new BadRequestException('Invalid JSON file');
      }
      if (!Array.isArray(parsed)) {
        throw new BadRequestException(
          'JSON file must contain an array of listing objects',
        );
      }
      return {
        source: CarListingDraftSource.JSON,
        rows: parsed as Record<string, unknown>[],
      };
    }

    if (name.endsWith('.csv') || mimetype.includes('csv')) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });
      return { source: CarListingDraftSource.CSV, rows };
    }

    if (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mimetype.includes('sheet') ||
      mimetype.includes('excel')
    ) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });
      return { source: CarListingDraftSource.EXCEL, rows };
    }

    throw new BadRequestException(
      'Unsupported file type — upload .json, .csv, .xlsx, or .xls',
    );
  }

  /** Pre-loads all option tables once per upload so per-row lookups are in-memory, not per-row queries. */
  private async loadReferenceLookups() {
    const [models, carTypes, brands, features, tags] = await Promise.all([
      this.prisma.carModelOption.findMany({
        select: { id: true, title: true },
      }),
      this.prisma.carTypeOption.findMany({
        select: { id: true, title: true },
      }),
      this.prisma.carBrandOption.findMany({
        select: { id: true, name: true },
      }),
      this.prisma.carFeatureOption.findMany({
        select: { id: true, title: true },
      }),
      this.prisma.carTagOption.findMany({
        select: { id: true, title: true },
      }),
    ]);

    const byIdOrTitle = (
      rows: { id: string; title?: string; name?: string }[],
    ) => {
      const map = new Map<string, string>(); // lowercased id-or-label -> id
      rows.forEach((r) => {
        map.set(r.id.toLowerCase(), r.id);
        const label = r.title ?? r.name;
        if (label) map.set(label.toLowerCase(), r.id);
      });
      return map;
    };

    return {
      models: byIdOrTitle(models),
      carTypes: byIdOrTitle(carTypes),
      brands: byIdOrTitle(brands),
      features: byIdOrTitle(features),
      tags: byIdOrTitle(tags),
    };
  }

  /** Maps one raw spreadsheet/JSON row into a CreateListingDto-shaped object + validation errors. */
  private normalizeRow(
    row: Record<string, unknown>,
    rowNumber: number,
    lookups: Awaited<ReturnType<ListingDraftsService['loadReferenceLookups']>>,
  ): ParsedRow {
    // Case-insensitive column access (Excel/CSV headers can vary in casing)
    const get = (key: string) => {
      const found = Object.keys(row).find(
        (k) => k.trim().toLowerCase() === key.toLowerCase(),
      );
      return found ? row[found] : undefined;
    };

    const errors: string[] = [];

    const title = get('title') ? String(get('title')).trim() : '';
    if (!title) errors.push('title is required');

    const purposeRaw = String(get('purpose') ?? '')
      .trim()
      .toUpperCase();
    const purpose = (Object.values(ListingPurpose) as string[]).includes(
      purposeRaw,
    )
      ? purposeRaw
      : undefined;
    if (!purpose) errors.push('purpose must be SALE or RENT');

    const modelRaw = String(get('model') ?? '').trim();
    const modelId = modelRaw
      ? lookups.models.get(modelRaw.toLowerCase())
      : undefined;
    if (!modelRaw) errors.push('model is required');
    else if (!modelId)
      errors.push(`model "${modelRaw}" not found (use a car model ID or exact title)`);

    const brandRaw = String(get('brand') ?? '').trim();
    const brandId = brandRaw
      ? lookups.brands.get(brandRaw.toLowerCase())
      : undefined;
    if (!brandRaw) errors.push('brand is required');
    else if (!brandId)
      errors.push(`brand "${brandRaw}" not found (use a car brand ID or exact name)`);

    const price = toNumber(get('price'));
    if (price === undefined || price <= 0)
      errors.push('price must be a positive number');

    const carTypeRaw = String(get('carType') ?? '').trim();
    const carTypeId = carTypeRaw
      ? lookups.carTypes.get(carTypeRaw.toLowerCase())
      : undefined;
    if (carTypeRaw && !carTypeId)
      errors.push(`carType "${carTypeRaw}" not found`);

    const transmissionRaw = String(get('transmission') ?? '')
      .trim()
      .toUpperCase();
    const transmission = (
      Object.values(TransmissionType) as string[]
    ).includes(transmissionRaw)
      ? transmissionRaw
      : undefined;
    if (transmissionRaw && !transmission)
      errors.push('transmission must be AUTOMATIC or MANUAL');

    const fuelTypeRaw = String(get('fuelType') ?? '')
      .trim()
      .toUpperCase();
    const fuelType = (Object.values(FuelType) as string[]).includes(
      fuelTypeRaw,
    )
      ? fuelTypeRaw
      : undefined;
    if (fuelTypeRaw && !fuelType)
      errors.push('fuelType must be PETROL, DIESEL, HYBRID, or ELECTRIC');

    const conditionRaw = String(get('condition') ?? '')
      .trim()
      .toUpperCase();
    const condition = (Object.values(CarCondition) as string[]).includes(
      conditionRaw,
    )
      ? conditionRaw
      : undefined;
    if (conditionRaw && !condition) errors.push('condition must be NEW or USED');

    const featureLabels = splitList(get('features'));
    const features = featureLabels
      .map((label) => lookups.features.get(label.toLowerCase()))
      .filter((id): id is string => Boolean(id));
    const unresolvedFeatures = featureLabels.filter(
      (label) => !lookups.features.get(label.toLowerCase()),
    );
    if (unresolvedFeatures.length > 0)
      errors.push(`features not found: ${unresolvedFeatures.join(', ')}`);

    const tagLabels = splitList(get('tags'));
    const tags = tagLabels
      .map((label) => lookups.tags.get(label.toLowerCase()))
      .filter((id): id is string => Boolean(id));
    const unresolvedTags = tagLabels.filter(
      (label) => !lookups.tags.get(label.toLowerCase()),
    );
    if (unresolvedTags.length > 0)
      errors.push(`tags not found: ${unresolvedTags.join(', ')}`);

    const photoUrls = splitList(get('photos'));
    const photos = photoUrls.map((url, i) => ({ url, sortOrder: i }));

    let extraProperties: Record<string, unknown> | undefined;
    const extraPropertiesRaw = get('extraProperties');
    if (extraPropertiesRaw) {
      try {
        extraProperties =
          typeof extraPropertiesRaw === 'string'
            ? JSON.parse(extraPropertiesRaw)
            : (extraPropertiesRaw as any);
      } catch {
        errors.push('extraProperties is not valid JSON');
      }
    }

    const latitude = toNumber(get('latitude'));
    const longitude = toNumber(get('longitude'));

    const data: Record<string, unknown> = {
      title,
      description: get('description') ? String(get('description')) : undefined,
      purpose,
      modelId,
      brandId,
      price,
      priceNegotiable: toBoolean(get('priceNegotiable')) ?? false,
      modelYear: toNumber(get('modelYear')),
      mileage: toNumber(get('mileage')),
      transmission,
      fuelType,
      condition,
      exteriorColor: get('exteriorColor')
        ? String(get('exteriorColor'))
        : undefined,
      interiorColor: get('interiorColor')
        ? String(get('interiorColor'))
        : undefined,
      cylinders: toNumber(get('cylinders')),
      doors: toNumber(get('doors')),
      vin: get('vin') ? String(get('vin')) : undefined,
      carTypeId,
      addressLine1: get('addressLine1')
        ? String(get('addressLine1'))
        : undefined,
      addressLine2: get('addressLine2')
        ? String(get('addressLine2'))
        : undefined,
      areaName: get('areaName') ? String(get('areaName')) : undefined,
      contactPhone: get('contactPhone')
        ? String(get('contactPhone'))
        : undefined,
      contactWhatsapp: get('contactWhatsapp')
        ? String(get('contactWhatsapp'))
        : undefined,
      features,
      tags,
      otherFeatures: get('otherFeatures')
        ? String(get('otherFeatures'))
        : undefined,
      latitude,
      longitude,
      extraProperties,
      photos,
    };

    // Drop undefined keys so drafts stay compact and merge cleanly at creation time
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    return { rowNumber, data, errors };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Draft CRUD
  // ────────────────────────────────────────────────────────────────────────────

  async listDrafts(
    userId: string,
    role: UserRole | undefined,
    query: QueryListingDraftsDto,
  ) {
    const dealerUserId = await this.resolveAgencyUserId(userId, role);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      dealerUserId,
      ...(query.batchId && { batchId: query.batchId }),
      ...(query.status && { status: query.status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.carListingDraft.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ batchId: 'desc' }, { rowNumber: 'asc' }],
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.carListingDraft.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getDraft(id: string, userId: string, role: UserRole | undefined) {
    const draft = await this.prisma.carListingDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException(`Draft "${id}" not found`);
    await this.resolveAgencyUserId(userId, role); // ensures caller is dealer/staff
    await this.assertSameAgency(draft.dealerUserId, userId);
    return draft;
  }

  async discardDraft(id: string, userId: string, role: UserRole | undefined) {
    const draft = await this.getDraft(id, userId, role);
    if (draft.status !== CarListingDraftStatus.PENDING) {
      throw new BadRequestException('Only PENDING drafts can be discarded');
    }
    return this.prisma.carListingDraft.update({
      where: { id },
      data: { status: CarListingDraftStatus.DISCARDED },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Consumed by ListingsService.create() when { draftId } is passed
  // ────────────────────────────────────────────────────────────────────────────

  /** Validates the draft is usable by this requester and returns its stored data. */
  async consumeDraftData(
    draftId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const draft = await this.prisma.carListingDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) throw new NotFoundException(`Draft "${draftId}" not found`);
    await this.assertSameAgency(draft.dealerUserId, userId);
    if (draft.status !== CarListingDraftStatus.PENDING) {
      throw new BadRequestException(
        `Draft is already ${draft.status.toLowerCase()}`,
      );
    }
    return draft.data as Record<string, unknown>;
  }

  /** Marks a draft as consumed once its listing was successfully created. Best-effort — never throws. */
  async markDraftUsed(draftId: string, listingId: string): Promise<void> {
    await this.prisma.carListingDraft
      .update({
        where: { id: draftId },
        data: { status: CarListingDraftStatus.USED, listingId },
      })
      .catch(() => {});
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Downloadable template
  // ────────────────────────────────────────────────────────────────────────────

  /** Generates an .xlsx template (header row + one example row) — CSV uses the same headers. */
  getTemplateBuffer(): Buffer {
    const worksheet = XLSX.utils.json_to_sheet([EXAMPLE_ROW], {
      header: [...BULK_UPLOAD_COLUMNS],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Listings');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
