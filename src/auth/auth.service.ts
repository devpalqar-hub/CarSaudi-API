import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Permission, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../shared/firebase.service';
import { AppleAuthDto } from './dto/apple-auth.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { FirebaseAuthDto } from './dto/firebase-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { AppleAuthService } from './services/apple-auth.service';
import { GoogleAuthService } from './services/google-auth.service';
import { OtpService } from './services/otp.service';
import { PasswordResetService } from './services/password-reset.service';
import { AuthResponse, JwtPayload } from './auth.types';

/** Roles allowed to use email/password login — and therefore forgot/reset password. */
const PASSWORD_LOGIN_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.MODERATOR,
  UserRole.DEALER,
  UserRole.DEALER_STAFF,
];

// ─── Type ─────────────────────────────────────────────────────────────────────

type SafeUser = Omit<User, 'password' | 'googleId' | 'appleId'>;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly passwordResetService: PasswordResetService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly firebaseService: FirebaseService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Sign a JWT for the given user and return the standard auth response.
   */
  private signToken(user: User, isNew = false): AuthResponse {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      isProfileComplete: user.isProfileComplete,
    };

    const access_token = this.jwtService.sign(payload);

    if (isNew) {
      return { isNew: true, access_token, token_type: 'Bearer' };
    }

    const { password, googleId, appleId, ...safeUser } = user as User & {
      password?: string;
      googleId?: string;
      appleId?: string;
    };

    return {
      isNew: false,
      access_token,
      token_type: 'Bearer',
      profile: safeUser,
    };
  }

  private normalizePhone(phone: string): { formatted: string; clean: string } {
    const clean = phone.replace(/\D/g, '');
    const formatted = clean ? `+${clean}` : phone;
    return { formatted, clean };
  }

  /**
   * Find or create a USER-role account by phone (for OTP flow).
   */
  private async findOrCreateByPhone(
    rawPhone: string,
  ): Promise<{ user: User; created: boolean }> {
    const { formatted, clean } = this.normalizePhone(rawPhone);

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phone: formatted },
          { phone: clean },
          { phone: `+${clean}` },
          { phone: rawPhone },
        ],
      },
    });

    if (user) {
      if (user.phone !== formatted) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { phone: formatted },
        });
      }
      return { user, created: false };
    }

    user = await this.prisma.user.create({
      data: {
        phone: formatted,
        role: UserRole.USER,
        authProvider: AuthProvider.WHATSAPP_OTP,
        isProfileComplete: false,
      },
    });

    return { user, created: true };
  }

  /**
   * Find or create a USER-role account by Google ID.
   */
  private async findOrCreateByGoogleId(
    googleId: string,
    email?: string,
    name?: string,
  ): Promise<{ user: User; created: boolean }> {
    let user = await this.prisma.user.findUnique({ where: { googleId } });

    if (user) {
      return { user, created: false };
    }

    // Check if a user already exists with the same email (account merging)
    if (email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingByEmail) {
        // Link the Google ID to the existing account
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId },
        });
        return { user, created: false };
      }
    }

    user = await this.prisma.user.create({
      data: {
        googleId,
        email: email ?? null,
        name: name ?? null,
        role: UserRole.USER,
        authProvider: AuthProvider.GOOGLE,
        isProfileComplete: false,
      },
    });

    return { user, created: true };
  }

  /**
   * Find or create a USER-role account by Apple ID.
   */
  private async findOrCreateByAppleId(
    appleId: string,
    email?: string,
    name?: string,
  ): Promise<{ user: User; created: boolean }> {
    let user = await this.prisma.user.findUnique({ where: { appleId } });

    if (user) {
      return { user, created: false };
    }

    // Check if a user already exists with the same email
    if (email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (existingByEmail) {
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { appleId },
        });
        return { user, created: false };
      }
    }

    user = await this.prisma.user.create({
      data: {
        appleId,
        email: email ?? null,
        name: name ?? null,
        role: UserRole.USER,
        authProvider: AuthProvider.APPLE,
        isProfileComplete: false,
      },
    });

    return { user, created: true };
  }

  // ── Public Methods ─────────────────────────────────────────────────────────

  /**
   * Send a WhatsApp OTP to the given phone number.
   */
  async sendOtp(dto: SendOtpDto) {
    return this.otpService.sendOtp(dto.phone);
  }

  /**
   * Verify WhatsApp OTP.
   * - Existing user  → { isNew: false, access_token, profile }
   * - New user       → { isNew: true, access_token }
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponse> {
    await this.otpService.verifyOtp(dto.phone, dto.otp);

    const { user, created } = await this.findOrCreateByPhone(dto.phone);

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    return this.signToken(user, created);
  }

  /**
   * Google Sign-In.
   * - Existing user  → { isNew: false, access_token, profile }
   * - New user       → { isNew: true, access_token }
   */
  async googleLogin(dto: GoogleAuthDto): Promise<AuthResponse> {
    const googleUser = await this.googleAuthService.verifyToken(dto.idToken);

    const { user, created } = await this.findOrCreateByGoogleId(
      googleUser.googleId,
      googleUser.email,
      googleUser.name,
    );

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    return this.signToken(user, created);
  }

  /**
   * Apple Sign-In.
   * - Existing user  → { isNew: false, access_token, profile }
   * - New user       → { isNew: true, access_token }
   */
  async appleLogin(dto: AppleAuthDto): Promise<AuthResponse> {
    const appleUser = await this.appleAuthService.verifyToken(dto.idToken);

    // Build name from firstName/lastName (Apple only provides once)
    const name =
      dto.firstName || dto.lastName
        ? `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim()
        : undefined;

    const { user, created } = await this.findOrCreateByAppleId(
      appleUser.appleId,
      appleUser.email ?? dto.email,
      name,
    );

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    return this.signToken(user, created);
  }

  /**
   * Unified Firebase social sign-in — works for any provider the client used with Firebase
   * Authentication (Google, Apple, ...). The provider is auto-detected from the token, so
   * the client doesn't need to know/tell us which one was used.
   * - Existing user  → { isNew: false, access_token, profile }
   * - New user       → { isNew: true, access_token }
   */
  async firebaseLogin(dto: FirebaseAuthDto): Promise<AuthResponse> {
    let decoded;
    try {
      decoded = await this.firebaseService.verifyIdToken(dto.idToken);
    } catch (error) {
      throw new UnauthorizedException(
        'Invalid or expired Firebase token. Please sign in again.',
      );
    }

    const provider = decoded.firebase?.sign_in_provider;

    let result: { user: User; created: boolean };
    if (provider === 'google.com') {
      result = await this.findOrCreateByGoogleId(
        decoded.uid,
        decoded.email,
        decoded.name,
      );
    } else if (provider === 'apple.com') {
      // Build name from firstName/lastName (Apple only provides once) with the token's name as fallback
      const name =
        dto.firstName || dto.lastName
          ? `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim()
          : decoded.name;
      result = await this.findOrCreateByAppleId(
        decoded.uid,
        decoded.email ?? dto.email,
        name,
      );
    } else {
      throw new UnauthorizedException(
        `Unsupported sign-in provider: ${provider ?? 'unknown'}. Supported: Google, Apple.`,
      );
    }

    if (!result.user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    return this.signToken(result.user, result.created);
  }

  /**
   * Complete a new user's profile after OTP/social login.
   * - OTP users:    supply name (optional) and email (optional)
   * - Social users: supply phone (required to fully link account)
   * Issues a fresh JWT with isProfileComplete = true.
   */
  async completeProfile(
    userId: string,
    dto: CompleteProfileDto,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (
      user.role !== UserRole.USER &&
      user.authProvider === AuthProvider.LOCAL
    ) {
      throw new ForbiddenException(
        'Profile completion is only for OTP and social login users',
      );
    }

    // Validate phone uniqueness
    if (dto.phone && dto.phone !== user.phone) {
      const existing = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (existing) {
        throw new ConflictException(
          'This phone number is already linked to another account',
        );
      }
    }

    // Validate email uniqueness
    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException(
          'This email address is already linked to another account',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        isProfileComplete: true,
      },
    });

    return this.signToken(updated, false);
  }

  /**
   * Email + Password login.
   * Restricted to SUPER_ADMIN, MODERATOR, DEALER, DEALER_STAFF.
   */
  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { identifier, password } = loginDto;

    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await this.prisma.user.findUnique({ where: { email: identifier } })
      : await this.prisma.user.findUnique({ where: { phone: identifier } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Your account has been deactivated');
    }

    // Block USER-role accounts from using email/password login
    if (user.role === UserRole.USER) {
      throw new ForbiddenException(
        'Please use WhatsApp OTP or social login to access your account',
      );
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'This account does not have a password. Please use your configured login method.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.signToken(user, false);
  }

  // ── Forgot / Reset Password (SUPER_ADMIN, MODERATOR, DEALER, DEALER_STAFF) ───

  /**
   * Step 1: Sends a 6-digit OTP to the account's email to start a password reset.
   * Restricted to the email/password login roles. Always returns a generic message
   * (never reveals whether the email is registered) to prevent account enumeration.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !PASSWORD_LOGIN_ROLES.includes(user.role) || !user.isActive) {
      // Same generic response as the "found" path — don't leak account existence.
      return {
        message: `If an account exists for ${dto.email}, a password reset OTP has been sent.`,
      };
    }

    return this.passwordResetService.requestOtp(dto.email, user.name);
  }

  /**
   * Step 2: Verifies the OTP and sets a new password for the account.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException(
        'Password and confirm password do not match',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !PASSWORD_LOGIN_ROLES.includes(user.role) || !user.isActive) {
      throw new UnauthorizedException('Invalid email or OTP');
    }

    await this.passwordResetService.verifyOtp(dto.email, dto.otp);

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return {
      message:
        'Password has been reset successfully. You can now log in with your new password.',
    };
  }

  /**
   * Get the current authenticated user's profile.
   * For SUPER_ADMIN, MODERATOR and DEALER_STAFF, also attaches their `permissions` list:
   * - SUPER_ADMIN   → every `Permission` (implicit full access)
   * - MODERATOR     → granular `Permission[]` from their ModeratorProfile
   * - DEALER_STAFF  → granular `DealerStaffPermission[]` granted by their dealer
   */
  async getMe(user: SafeUser) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return { ...user, permissions: Object.values(Permission) };
    }

    if (user.role === UserRole.MODERATOR) {
      const profile = await this.prisma.moderatorProfile.findUnique({
        where: { userId: user.id },
        select: { permissions: true },
      });
      return { ...user, permissions: profile?.permissions ?? [] };
    }

    if (user.role === UserRole.DEALER_STAFF) {
      const staff = await this.prisma.dealerStaff.findUnique({
        where: { staffUserId: user.id },
        select: { permissions: true },
      });
      return { ...user, permissions: staff?.permissions ?? [] };
    }

    return user;
  }
}
