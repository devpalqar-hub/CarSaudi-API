import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AccountStatus } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET', 'default-access-secret'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        accountStatus: true,
        isVerified: true,
        suspendedAt: true,
        suspendUntil: true,
        roles: {
          select: {
            role: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Auto-reactivate if temporary suspension has expired
    if (
      user.accountStatus === AccountStatus.SUSPENDED &&
      user.suspendUntil &&
      user.suspendUntil < new Date()
    ) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          accountStatus: AccountStatus.ACTIVE,
          suspendedAt: null,
          suspendUntil: null,
          suspendReason: null,
        },
      });
      // Allow request to proceed after reactivation
    } else if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Your account has been ' + user.accountStatus.toLowerCase(),
      );
    }

    // Flatten roles to string array
    const roles = user.roles.map((ur) => ur.role.name);

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      accountStatus: user.accountStatus,
      isVerified: user.isVerified,
      roles,
    };
  }
}
