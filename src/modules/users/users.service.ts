import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { AccountStatus, Prisma, Role } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Select fields for user responses (exclude password)
   */
  private readonly userSelect = {
    id: true,
    fullName: true,
    email: true,
    phone: true,
    role: true,
    accountStatus: true,
    isVerified: true,
    suspendedAt: true,
    suspendReason: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
  };

  /**
   * List users with pagination, search, and filtering
   */
  async findAll(query: QueryUsersDto): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      role,
      accountStatus,
      isVerified,
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.UserWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (accountStatus) {
      where.accountStatus = accountStatus;
    }

    if (isVerified !== undefined && isVerified !== '') {
      where.isVerified = isVerified === 'true';
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    // Build orderBy
    const orderBy: Prisma.UserOrderByWithRelationInput = {};
    const allowedSortFields = [
      'fullName',
      'email',
      'role',
      'accountStatus',
      'createdAt',
      'lastLoginAt',
    ];

    if (allowedSortFields.includes(sortBy)) {
      (orderBy as any)[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: this.userSelect,
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get user by ID
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Create a new user (admin action)
   */
  async create(dto: CreateUserDto, creatorRole: Role) {
    // Only SUPER_ADMIN can create SECONDARY_ADMIN
    if (
      dto.role === Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Cannot create a Super Admin account');
    }

    if (dto.role === Role.SECONDARY_ADMIN && creatorRole !== Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can create Secondary Admin accounts',
      );
    }

    // Check for existing email
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    // Check for existing phone
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingPhone) {
      throw new ConflictException('Phone number already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        password: hashedPassword,
        role: dto.role,
        isVerified: true, // Admin-created users are pre-verified
      },
      select: this.userSelect,
    });

    this.logger.log(
      `User created by admin: ${user.email} with role ${user.role}`,
    );

    return user;
  }

  /**
   * Update user by ID (admin action)
   */
  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check for email conflict
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (existing) {
        throw new ConflictException('Email already registered');
      }
    }

    // Check for phone conflict
    if (dto.phone && dto.phone !== user.phone) {
      const existing = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (existing) {
        throw new ConflictException('Phone number already registered');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.fullName && { fullName: dto.fullName }),
        ...(dto.email && { email: dto.email.toLowerCase() }),
        ...(dto.phone && { phone: dto.phone }),
      },
      select: this.userSelect,
    });

    return updated;
  }

  /**
   * Update own profile (authenticated user)
   */
  async updateProfile(userId: string, dto: UpdateUserDto) {
    return this.update(userId, dto);
  }

  /**
   * Suspend user account
   */
  async suspend(id: string, dto: SuspendUserDto, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === adminId) {
      throw new BadRequestException('Cannot suspend your own account');
    }

    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot suspend a Super Admin account');
    }

    if (user.accountStatus === AccountStatus.SUSPENDED) {
      throw new BadRequestException('User is already suspended');
    }

    const suspended = await this.prisma.user.update({
      where: { id },
      data: {
        accountStatus: AccountStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendReason: dto.reason,
      },
      select: this.userSelect,
    });

    // Invalidate all sessions
    await this.prisma.session.deleteMany({
      where: { userId: id },
    });

    this.logger.log(`User ${user.email} suspended. Reason: ${dto.reason}`);

    return suspended;
  }

  /**
   * Reactivate suspended user account
   */
  async reactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.accountStatus !== AccountStatus.SUSPENDED) {
      throw new BadRequestException('User is not suspended');
    }

    const reactivated = await this.prisma.user.update({
      where: { id },
      data: {
        accountStatus: AccountStatus.ACTIVE,
        suspendedAt: null,
        suspendReason: null,
      },
      select: this.userSelect,
    });

    this.logger.log(`User ${user.email} reactivated`);

    return reactivated;
  }

  /**
   * Permanently delete user account (cascades sessions & OTPs)
   */
  async remove(id: string, adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.id === adminId) {
      throw new BadRequestException('Cannot delete your own account');
    }

    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot delete a Super Admin account');
    }

    await this.prisma.user.delete({ where: { id } });

    this.logger.log(`User ${user.email} permanently deleted`);

    return { message: 'User permanently deleted' };
  }

  /**
   * Admin reset user password
   */
  async resetPassword(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate temporary password
    const tempPassword =
      'Temp' +
      Math.random().toString(36).substring(2, 8) +
      Math.floor(Math.random() * 100);

    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    // Invalidate all sessions (force re-login)
    await this.prisma.session.deleteMany({
      where: { userId: id },
    });

    this.logger.log(`Password reset by admin for user: ${user.email}`);

    return {
      message: 'Password reset successfully',
      temporaryPassword: tempPassword,
    };
  }

  /**
   * Export users to XLSX
   */
  async exportToXlsx(query: QueryUsersDto): Promise<Buffer> {
    // Fetch all users matching the filter (no pagination for export)
    const where: Prisma.UserWhereInput = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.accountStatus) {
      where.accountStatus = query.accountStatus;
    }

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: this.userSelect,
      orderBy: { createdAt: 'desc' },
    });

    // Transform data for Excel
    const rows = users.map((user, index) => ({
      '#': index + 1,
      'Full Name': user.fullName,
      Email: user.email,
      Phone: user.phone,
      Role: user.role,
      Status: user.accountStatus,
      Verified: user.isVerified ? 'Yes' : 'No',
      'Last Login': user.lastLoginAt
        ? new Date(user.lastLoginAt).toISOString()
        : 'Never',
      'Created At': new Date(user.createdAt).toISOString(),
    }));

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths
    worksheet['!cols'] = [
      { wch: 5 },  // #
      { wch: 25 }, // Full Name
      { wch: 30 }, // Email
      { wch: 18 }, // Phone
      { wch: 18 }, // Role
      { wch: 12 }, // Status
      { wch: 10 }, // Verified
      { wch: 25 }, // Last Login
      { wch: 25 }, // Created At
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Users');

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    });

    return buffer;
  }
}
