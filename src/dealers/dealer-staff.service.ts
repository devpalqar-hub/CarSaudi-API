import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, DealerStaffPermission, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { CreateDealerStaffDto } from './dto/create-dealer-staff.dto';
import { UpdateDealerStaffDto } from './dto/update-dealer-staff.dto';

/** Reusable staff select shape */
const STAFF_SELECT = {
  id: true,
  staffUserId: true,
  dealerUserId: true,
  position: true,
  permissions: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  staffUser: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  },
};

@Injectable()
export class DealerStaffService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Create staff
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Creates a new User with role DEALER_STAFF and links them to the dealer.
   * Only the owning DEALER (or a DEALER_STAFF with MANAGE_STAFF permission) may call this.
   */
  async create(dealerUserId: string, dto: CreateDealerStaffDto) {
    // Confirm caller is actually a dealer
    await this.assertDealer(dealerUserId);

    // Email uniqueness check
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    // Phone uniqueness check
    if (dto.phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (existingPhone) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
      }
    }

    const hashed = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const staffRecord = await this.prisma.$transaction(async (tx) => {
      const staffUser = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone ?? null,
          password: hashed,
          role: UserRole.DEALER_STAFF,
          authProvider: AuthProvider.LOCAL,
          isProfileComplete: true,
          isActive: true,
        },
      });

      const record = await tx.dealerStaff.create({
        data: {
          dealerUserId,
          staffUserId: staffUser.id,
          position: dto.position ?? null,
          permissions: dto.permissions,
          isActive: true,
        },
        select: STAFF_SELECT,
      });

      return record;
    });

    // Fire-and-forget welcome email
    this.mail.sendStaffWelcomeEmail(
      dto.email,
      dto.name,
      dto.password,
      dto.permissions,
    );

    return staffRecord;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // List staff
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Returns all staff members belonging to a dealer (with optional search).
   */
  async findAll(dealerUserId: string, page = 1, limit = 20, search?: string) {
    await this.assertDealer(dealerUserId);

    const skip = (page - 1) * limit;

    const where: any = {
      dealerUserId,
      ...(search && {
        OR: [
          {
            staffUser: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
          {
            staffUser: {
              email: { contains: search, mode: 'insensitive' },
            },
          },
          { position: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [staff, total] = await Promise.all([
      this.prisma.dealerStaff.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: STAFF_SELECT,
      }),
      this.prisma.dealerStaff.count({ where }),
    ]);

    return {
      data: staff,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Get single staff
  // ────────────────────────────────────────────────────────────────────────────

  async findOne(dealerUserId: string, staffId: string) {
    await this.assertDealer(dealerUserId);

    const record = await this.prisma.dealerStaff.findFirst({
      where: { id: staffId, dealerUserId },
      select: STAFF_SELECT,
    });

    if (!record) {
      throw new NotFoundException(`Staff member "${staffId}" not found`);
    }

    return record;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Update staff
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Updates staff profile, permissions, and/or active status.
   */
  async update(
    dealerUserId: string,
    staffId: string,
    dto: UpdateDealerStaffDto,
  ) {
    await this.assertDealer(dealerUserId);

    const record = await this.prisma.dealerStaff.findFirst({
      where: { id: staffId, dealerUserId },
    });

    if (!record) {
      throw new NotFoundException(`Staff member "${staffId}" not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Update User fields (name, phone)
      if (dto.name !== undefined || dto.phone !== undefined) {
        await tx.user.update({
          where: { id: record.staffUserId },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.phone !== undefined && { phone: dto.phone }),
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          },
        });
      } else if (dto.isActive !== undefined) {
        await tx.user.update({
          where: { id: record.staffUserId },
          data: { isActive: dto.isActive },
        });
      }

      // Update DealerStaff record
      return tx.dealerStaff.update({
        where: { id: staffId },
        data: {
          ...(dto.position !== undefined && { position: dto.position }),
          ...(dto.permissions !== undefined && {
            permissions: dto.permissions,
          }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        select: STAFF_SELECT,
      });
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Update permissions only
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Convenience endpoint: replace the full permission set for a staff member.
   */
  async updatePermissions(
    dealerUserId: string,
    staffId: string,
    permissions: DealerStaffPermission[],
  ) {
    await this.assertDealer(dealerUserId);

    const record = await this.prisma.dealerStaff.findFirst({
      where: { id: staffId, dealerUserId },
    });

    if (!record) {
      throw new NotFoundException(`Staff member "${staffId}" not found`);
    }

    return this.prisma.dealerStaff.update({
      where: { id: staffId },
      data: { permissions },
      select: STAFF_SELECT,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Remove (deactivate)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Soft-deactivates a staff member (sets isActive = false on both User and DealerStaff).
   */
  async remove(dealerUserId: string, staffId: string) {
    await this.assertDealer(dealerUserId);

    const record = await this.prisma.dealerStaff.findFirst({
      where: { id: staffId, dealerUserId },
    });

    if (!record) {
      throw new NotFoundException(`Staff member "${staffId}" not found`);
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.staffUserId },
        data: { isActive: false },
      }),
      this.prisma.dealerStaff.update({
        where: { id: staffId },
        data: { isActive: false },
      }),
    ]);

    return { message: 'Staff member deactivated successfully' };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // My profile (staff self-view)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Allows a DEALER_STAFF user to view their own staff record, including their permissions.
   */
  async getMyProfile(staffUserId: string) {
    const record = await this.prisma.dealerStaff.findUnique({
      where: { staffUserId },
      select: {
        ...STAFF_SELECT,
        dealerUser: {
          select: {
            id: true,
            name: true,
            email: true,
            dealerProfile: {
              select: {
                dealerName: true,
                contactPhone: true,
                website: true,
                description: true,
              },
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Staff profile not found');
    }

    return record;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────────

  private async assertDealer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new NotFoundException('Dealer account not found or inactive');
    }

    if (user.role !== UserRole.DEALER) {
      throw new ForbiddenException('Only DEALER accounts can manage staff');
    }
  }
}
