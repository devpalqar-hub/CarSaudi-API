import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Strip sensitive fields from a user record before returning it.
   */
  private exclude<T extends Record<string, any>, Key extends keyof T>(
    user: T,
    keys: Key[],
  ): Omit<T, Key> {
    return Object.fromEntries(
      Object.entries(user).filter(([key]) => !keys.includes(key as Key)),
    ) as Omit<T, Key>;
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  /**
   * Create a new user (admin-initiated creation for non-USER roles).
   * LOCAL auth users require a password; social/OTP users may omit it.
   */
  async create(createUserDto: CreateUserDto) {
    const {
      name,
      email,
      phone,
      password,
      role = UserRole.USER,
      authProvider = AuthProvider.LOCAL,
    } = createUserDto;

    // Validate at least one contact method is provided
    if (!email && !phone) {
      throw new BadRequestException(
        'Either email or phone number must be provided',
      );
    }

    // LOCAL provider requires a password
    if (authProvider === AuthProvider.LOCAL && !password) {
      throw new BadRequestException(
        'Password is required for email/password accounts',
      );
    }

    // Check for duplicate email
    if (email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingEmail) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    // Check for duplicate phone
    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone },
      });
      if (existingPhone) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
      }
    }

    const hashedPassword = password
      ? await bcrypt.hash(password, this.SALT_ROUNDS)
      : null;

    // LOCAL users with all required info are considered profile-complete
    const isProfileComplete =
      authProvider === AuthProvider.LOCAL
        ? !!(name && (email || phone))
        : false;

    const user = await this.prisma.user.create({
      data: {
        name: name ?? null,
        email: email ?? null,
        phone: phone ?? null,
        password: hashedPassword,
        role,
        authProvider,
        isProfileComplete,
      },
    });

    return this.exclude(user, ['password', 'googleId', 'appleId']);
  }

  async findAll(queryDto: QueryUserDto) {
    const { page = 1, limit = 10, role, isActive, search } = queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(isActive !== undefined && { isActive }),
      ...(role && { role }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          authProvider: true,
          isProfileComplete: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // Batched, single extra query for the whole page — not N+1 per user
    const userIds = users.map((u) => u.id);
    const listingCounts = userIds.length
      ? await this.prisma.listing.groupBy({
          by: ['createdById'],
          where: { createdById: { in: userIds } },
          _count: true,
        })
      : [];
    const countByUser = new Map(
      listingCounts.map((c) => [c.createdById, c._count]),
    );

    const data = users.map((u) => ({
      ...u,
      /** Total number of properties (listings) this user has created */
      listingsCount: countByUser.get(u.id) ?? 0,
    }));

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

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        authProvider: true,
        isProfileComplete: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Present only for DEALER accounts (null otherwise) — quick agency context for admins
        dealerProfile: {
          select: {
            dealerName: true,
            tradeNumber: true,
            reraNumber: true,
            address: true,
            city: true,
            website: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    const [listingsCount, listings] = await Promise.all([
      this.prisma.listing.count({ where: { createdById: id } }),
      this.prisma.listing.findMany({
        where: { createdById: id },
        select: {
          id: true,
          referenceCode: true,
          slug: true,
          propertyName: true,
          purpose: true,
          status: true,
          price: true,
          type: { select: { id: true, title: true } },
          municipality: { select: { id: true, name: true } },
          areaName: true,
          viewsCount: true,
          createdAt: true,
          photos: {
            select: { url: true },
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      ...user,
      /** Total number of properties (listings) this user has created */
      listingsCount,
      /** Up to the 50 most recent properties this user has created */
      listings,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id);

    const { email, phone, password, ...rest } = updateUserDto;

    if (email) {
      const existing = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('A user with this email already exists');
      }
    }

    if (phone) {
      const existing = await this.prisma.user.findFirst({
        where: { phone, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException(
          'A user with this phone number already exists',
        );
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      ...rest,
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(password && {
        password: await bcrypt.hash(password, this.SALT_ROUNDS),
      }),
    };

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    return this.exclude(user, ['password', 'googleId', 'appleId']);
  }

  async updateStatus(id: string, isActive: boolean) {
    await this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive },
    });

    return this.exclude(user, ['password', 'googleId', 'appleId']);
  }

  async remove(id: string) {
    await this.findOne(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return this.exclude(user, ['password', 'googleId', 'appleId']);
  }
}
