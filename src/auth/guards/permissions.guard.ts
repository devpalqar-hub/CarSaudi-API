import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission requirement — allow through
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // SUPER_ADMIN bypasses all permission checks
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Only MODERATORs can have granular permissions
    if (user.role !== UserRole.MODERATOR) {
      throw new ForbiddenException('Access denied. Insufficient privileges.');
    }

    // Fetch moderator profile and check permissions
    const profile = await this.prisma.moderatorProfile.findUnique({
      where: { userId: user.id },
      select: { permissions: true },
    });

    if (!profile) {
      throw new ForbiddenException(
        'Moderator profile not found. Please contact a Super Admin.',
      );
    }

    const hasAll = requiredPermissions.every((perm) =>
      profile.permissions.includes(perm),
    );

    if (!hasAll) {
      const missing = requiredPermissions.filter(
        (p) => !profile.permissions.includes(p),
      );
      throw new ForbiddenException(
        `Access denied. Missing permission(s): ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
