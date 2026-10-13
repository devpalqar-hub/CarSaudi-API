import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingDraftStatus,
  ListingDraftSource,
  ListingPurpose,
  UserRole,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { QueryListingDraftsDto } from './dto/query-listing-drafts.dto';

/** One parsed + validated row, ready to be stored as a ListingDraft */
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
  'propertyName',
  'description',
  'purpose',
  'type',
  'price',
  'priceNegotiable',
  'bedrooms',
  'bathrooms',
  'area',
  'livingRooms',
  'parkingSpaces',
  'floorNumber',
  'totalFloors',
  'yearBuilt',
  'furnishing',
  'addressLine1',
  'addressLine2',
  'areaName',
  'municipality',
  'contactPhone',
  'contactWhatsapp',
  'amenities',
  'nearbyTags',
  'otherFeatures',
  'latitude',
  'longitude',
  'extraProperties',
  'photos',
] as const;

const EXAMPLE_ROW: Record<(typeof BULK_UPLOAD_COLUMNS)[number], string> = {
  propertyName: 'Luxury 4-BR Villa in The Pearl Qatar',
  description: 'Stunning 4-bedroom villa with private pool and sea view',
  purpose: 'SALE',
  type: 'Villa',
  price: '5500000',
  priceNegotiable: 'false',
  bedrooms: '4',
  bathrooms: '5',
  area: '450.5',
  livingRooms: '2',
  parkingSpaces: '2',
  floorNumber: '',
  totalFloors: '',
  yearBuilt: '2019',
  furnishing: 'Fully Furnished',
  addressLine1: 'Porto Arabia Tower 5',
  addressLine2: '',
  areaName: 'The Pearl Qatar',
  municipality: 'Doha',
  contactPhone: '+97455512345',
  contactWhatsapp: '+97455512345',
  amenities: 'Swimming Pool, Covered Parking, Garden',
  nearbyTags: 'school, mall, beach',
  otherFeatures: 'Comes with a dedicated boat berth in the marina',
  latitude: '25.3548',
  longitude: '51.1839',
  extraProperties: '{"privatePool": true, "gardenAreaSqm": 200}',
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
        this.prisma.listingDraft.create({
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
    source: ListingDraftSource;
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
        source: ListingDraftSource.JSON,
        rows: parsed as Record<string, unknown>[],
      };
    }

    if (name.endsWith('.csv') || mimetype.includes('csv')) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });
      return { source: ListingDraftSource.CSV, rows };
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
      return { source: ListingDraftSource.EXCEL, rows };
    }

    throw new BadRequestException(
      'Unsupported file type — upload .json, .csv, .xlsx, or .xls',
    );
  }

  /** Pre-loads all option tables once per upload so per-row lookups are in-memory, not per-row queries. */
  private async loadReferenceLookups() {
    const [types, furnishings, municipalities, amenities, nearbyTags] =
      await Promise.all([
        this.prisma.listingTypeOption.findMany({
          select: { id: true, title: true },
        }),
        this.prisma.furnishingOption.findMany({
          select: { id: true, title: true },
        }),
        this.prisma.municipalityOption.findMany({
          select: { id: true, name: true },
        }),
        this.prisma.amenityOption.findMany({
          select: { id: true, title: true },
        }),
        this.prisma.nearbyTagOption.findMany({
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
      types: byIdOrTitle(types),
      furnishings: byIdOrTitle(furnishings),
      municipalities: byIdOrTitle(municipalities),
      amenities: byIdOrTitle(amenities),
      nearbyTags: byIdOrTitle(nearbyTags),
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

    const propertyName = get('propertyName')
      ? String(get('propertyName')).trim()
      : '';
    if (!propertyName) errors.push('propertyName is required');

    const purposeRaw = String(get('purpose') ?? '')
      .trim()
      .toUpperCase();
    const purpose = (Object.values(ListingPurpose) as string[]).includes(
      purposeRaw,
    )
      ? purposeRaw
      : undefined;
    if (!purpose) errors.push('purpose must be SALE or RENT');

    const typeRaw = String(get('type') ?? '').trim();
    const typeId = typeRaw
      ? lookups.types.get(typeRaw.toLowerCase())
      : undefined;
    if (!typeRaw) errors.push('type is required');
    else if (!typeId)
      errors.push(
        `type "${typeRaw}" not found (use a property type ID or exact title)`,
      );

    const price = toNumber(get('price'));
    if (price === undefined || price <= 0)
      errors.push('price must be a positive number');

    const furnishingRaw = String(get('furnishing') ?? '').trim();
    const furnishingId = furnishingRaw
      ? lookups.furnishings.get(furnishingRaw.toLowerCase())
      : undefined;
    if (furnishingRaw && !furnishingId)
      errors.push(`furnishing "${furnishingRaw}" not found`);

    const municipalityRaw = String(get('municipality') ?? '').trim();
    const municipalityId = municipalityRaw
      ? lookups.municipalities.get(municipalityRaw.toLowerCase())
      : undefined;
    if (municipalityRaw && !municipalityId)
      errors.push(`municipality "${municipalityRaw}" not found`);

    const amenityLabels = splitList(get('amenities'));
    const amenities = amenityLabels
      .map((label) => lookups.amenities.get(label.toLowerCase()))
      .filter((id): id is string => Boolean(id));
    const unresolvedAmenities = amenityLabels.filter(
      (label) => !lookups.amenities.get(label.toLowerCase()),
    );
    if (unresolvedAmenities.length > 0)
      errors.push(`amenities not found: ${unresolvedAmenities.join(', ')}`);

    const nearbyTagLabels = splitList(get('nearbyTags'));
    const nearbyTags = nearbyTagLabels
      .map((label) => lookups.nearbyTags.get(label.toLowerCase()))
      .filter((id): id is string => Boolean(id));
    const unresolvedTags = nearbyTagLabels.filter(
      (label) => !lookups.nearbyTags.get(label.toLowerCase()),
    );
    if (unresolvedTags.length > 0)
      errors.push(`nearbyTags not found: ${unresolvedTags.join(', ')}`);

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
      propertyName,
      description: get('description') ? String(get('description')) : undefined,
      purpose,
      typeId,
      price,
      priceNegotiable: toBoolean(get('priceNegotiable')) ?? false,
      bedrooms: toNumber(get('bedrooms')),
      bathrooms: toNumber(get('bathrooms')),
      area: toNumber(get('area')),
      livingRooms: toNumber(get('livingRooms')),
      parkingSpaces: toNumber(get('parkingSpaces')),
      floorNumber: toNumber(get('floorNumber')),
      totalFloors: toNumber(get('totalFloors')),
      yearBuilt: toNumber(get('yearBuilt')),
      furnishingId,
      addressLine1: get('addressLine1')
        ? String(get('addressLine1'))
        : undefined,
      addressLine2: get('addressLine2')
        ? String(get('addressLine2'))
        : undefined,
      areaName: get('areaName') ? String(get('areaName')) : undefined,
      municipalityId,
      contactPhone: get('contactPhone')
        ? String(get('contactPhone'))
        : undefined,
      contactWhatsapp: get('contactWhatsapp')
        ? String(get('contactWhatsapp'))
        : undefined,
      amenities,
      nearbyTags,
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
      this.prisma.listingDraft.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ batchId: 'desc' }, { rowNumber: 'asc' }],
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.listingDraft.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getDraft(id: string, userId: string, role: UserRole | undefined) {
    const draft = await this.prisma.listingDraft.findUnique({ where: { id } });
    if (!draft) throw new NotFoundException(`Draft "${id}" not found`);
    await this.resolveAgencyUserId(userId, role); // ensures caller is dealer/staff
    await this.assertSameAgency(draft.dealerUserId, userId);
    return draft;
  }

  async discardDraft(id: string, userId: string, role: UserRole | undefined) {
    const draft = await this.getDraft(id, userId, role);
    if (draft.status !== ListingDraftStatus.PENDING) {
      throw new BadRequestException('Only PENDING drafts can be discarded');
    }
    return this.prisma.listingDraft.update({
      where: { id },
      data: { status: ListingDraftStatus.DISCARDED },
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
    const draft = await this.prisma.listingDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) throw new NotFoundException(`Draft "${draftId}" not found`);
    await this.assertSameAgency(draft.dealerUserId, userId);
    if (draft.status !== ListingDraftStatus.PENDING) {
      throw new BadRequestException(
        `Draft is already ${draft.status.toLowerCase()}`,
      );
    }
    return draft.data as Record<string, unknown>;
  }

  /** Marks a draft as consumed once its listing was successfully created. Best-effort — never throws. */
  async markDraftUsed(draftId: string, listingId: string): Promise<void> {
    await this.prisma.listingDraft
      .update({
        where: { id: draftId },
        data: { status: ListingDraftStatus.USED, listingId },
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
