import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all available roles from the database
   */
  async getAllRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        label: true,
        description: true,
      },
    });

    return roles;
  }

  /**
   * Assign roles to a user (replaces existing roles)
   */
  async assignRole(
    userId: string,
    dto: AssignRoleDto,
    adminId: string,
    adminRoles: string[],
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          select: {
            role: { select: { name: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cannot change own roles
    if (userId === adminId) {
      throw new BadRequestException('Cannot change your own roles');
    }

    const currentRoles = user.roles.map((ur) => ur.role.name);

    // Cannot modify SUPER_ADMIN users (unless you are SUPER_ADMIN removing other roles)
    if (currentRoles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException(
        'Cannot modify the roles of a Super Admin',
      );
    }

    // Cannot assign SUPER_ADMIN role
    if (dto.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }

    // Only SUPER_ADMIN can assign SECONDARY_ADMIN
    if (
      dto.roles.includes('SECONDARY_ADMIN') &&
      !adminRoles.includes('SUPER_ADMIN')
    ) {
      throw new ForbiddenException(
        'Only Super Admin can assign Secondary Admin role',
      );
    }

    // SECONDARY_ADMIN cannot modify other SECONDARY_ADMIN
    if (
      currentRoles.includes('SECONDARY_ADMIN') &&
      !adminRoles.includes('SUPER_ADMIN')
    ) {
      throw new ForbiddenException(
        'Only Super Admin can modify Secondary Admin roles',
      );
    }

    // Validate requested roles exist
    const requestedRoles = await this.prisma.role.findMany({
      where: { name: { in: dto.roles } },
    });

    if (requestedRoles.length !== dto.roles.length) {
      const found = requestedRoles.map((r) => r.name);
      const invalid = dto.roles.filter((r) => !found.includes(r));
      throw new BadRequestException(
        `Invalid role(s): ${invalid.join(', ')}`,
      );
    }

    // Replace all roles in a transaction
    await this.prisma.$transaction([
      // Remove all existing roles
      this.prisma.userRole.deleteMany({
        where: { userId },
      }),
      // Assign new roles
      ...requestedRoles.map((role) =>
        this.prisma.userRole.create({
          data: {
            userId,
            roleId: role.id,
          },
        }),
      ),
    ]);

    // Fetch updated user
    const updated = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        accountStatus: true,
        roles: {
          select: {
            role: {
              select: { name: true, label: true },
            },
          },
        },
      },
    });

    const newRoles = updated!.roles.map((ur) => ur.role.name);

    this.logger.log(
      `Roles changed for ${user.email}: [${currentRoles.join(', ')}] → [${newRoles.join(', ')}]`,
    );

    return {
      message: `Roles updated to [${newRoles.join(', ')}] successfully`,
      user: {
        ...updated,
        roles: newRoles,
      },
    };
  }
}
