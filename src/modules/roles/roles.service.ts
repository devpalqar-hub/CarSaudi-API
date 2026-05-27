import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { Role } from '@prisma/client';

export interface RoleDescription {
  role: Role;
  label: string;
  description: string;
  permissions: string[];
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get all available roles with descriptions
   */
  getAllRoles(): RoleDescription[] {
    return [
      {
        role: Role.SUPER_ADMIN,
        label: 'Super Admin',
        description:
          'Full platform access with all administrative privileges. Can manage all users, roles, and platform configurations.',
        permissions: [
          'Manage all users',
          'Assign/revoke roles',
          'Create Secondary Admins',
          'Delete accounts permanently',
          'Manage platform settings',
          'Access all analytics',
          'Manage listings',
          'Manage dealers',
          'Manage payments',
          'Manage advertisements',
        ],
      },
      {
        role: Role.SECONDARY_ADMIN,
        label: 'Secondary Admin',
        description:
          'Administrative access with most management capabilities except Super Admin operations.',
        permissions: [
          'Manage users (create, update, suspend)',
          'Manage moderators',
          'Manage listings',
          'Manage dealers',
          'View analytics',
          'Manage promotions',
          'Export reports',
        ],
      },
      {
        role: Role.MODERATOR,
        label: 'Moderator',
        description:
          'Content moderation access for reviewing and managing vehicle listings and user content.',
        permissions: [
          'Review listings',
          'Approve/reject listings',
          'Flag content',
          'View user profiles',
          'Manage reported content',
        ],
      },
      {
        role: Role.DEALER,
        label: 'Dealer',
        description:
          'Verified car dealer account with vehicle listing management and dealer portal access.',
        permissions: [
          'Manage own listings',
          'View inquiries',
          'Manage dealer profile',
          'Access dealer analytics',
          'Manage subscriptions',
        ],
      },
      {
        role: Role.USER,
        label: 'User',
        description:
          'Standard platform user who can browse, search, and inquire about vehicle listings.',
        permissions: [
          'Browse listings',
          'Search vehicles',
          'Contact dealers',
          'Manage own profile',
          'Save favorites',
          'Post reviews',
        ],
      },
    ];
  }

  /**
   * Assign role to a user
   */
  async assignRole(
    userId: string,
    dto: AssignRoleDto,
    adminId: string,
    adminRole: Role,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cannot change own role
    if (userId === adminId) {
      throw new BadRequestException('Cannot change your own role');
    }

    // Cannot assign SUPER_ADMIN role
    if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }

    // Only SUPER_ADMIN can assign SECONDARY_ADMIN
    if (
      dto.role === Role.SECONDARY_ADMIN &&
      adminRole !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only Super Admin can assign Secondary Admin role',
      );
    }

    // Cannot modify SUPER_ADMIN users
    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Cannot modify the role of a Super Admin',
      );
    }

    // SECONDARY_ADMIN cannot modify other SECONDARY_ADMIN
    if (
      user.role === Role.SECONDARY_ADMIN &&
      adminRole !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only Super Admin can modify Secondary Admin roles',
      );
    }

    if (user.role === dto.role) {
      throw new BadRequestException(
        `User already has the ${dto.role} role`,
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        accountStatus: true,
      },
    });

    this.logger.log(
      `Role changed for ${user.email}: ${user.role} → ${dto.role}`,
    );

    return {
      message: `Role updated to ${dto.role} successfully`,
      user: updated,
    };
  }
}
