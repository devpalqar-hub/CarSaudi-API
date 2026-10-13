import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../../shared/mail.service';

/**
 * Email-OTP "forgot password" flow, shared by every email+password login role
 * (SUPER_ADMIN, MODERATOR, DEALER, DEALER_STAFF — see AuthService.login()).
 * Mirrors OtpService's WhatsApp OTP pattern, but by email and stored in its own table
 * (`PasswordResetOtp`) so it never collides with the phone-login OTP records.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly OTP_EXPIRY_MINUTES = 10;
  private readonly MAX_ATTEMPTS = 5;
  private readonly RESEND_COOLDOWN_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Generates and emails a password-reset OTP for the given address.
   * Always returns the same generic message regardless of whether an account exists for
   * that email, so the endpoint can't be used to enumerate registered accounts.
   */
  async requestOtp(
    rawEmail: string,
    contactName: string | null,
  ): Promise<{ message: string }> {
    const email = this.normalizeEmail(rawEmail);
    const genericMessage = `If an account exists for ${rawEmail}, a password reset OTP has been sent.`;

    const recentOtp = await this.prisma.passwordResetOtp.findFirst({
      where: {
        email,
        createdAt: {
          gte: new Date(Date.now() - this.RESEND_COOLDOWN_SECONDS * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentOtp) {
      const secondsLeft = Math.ceil(
        (recentOtp.createdAt.getTime() +
          this.RESEND_COOLDOWN_SECONDS * 1000 -
          Date.now()) /
          1000,
      );
      throw new BadRequestException(
        `Please wait ${secondsLeft} seconds before requesting a new OTP`,
      );
    }

    const otp = this.generateOtp();
    const expiresAt = new Date(
      Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    // Invalidate any previous unused OTPs for this email
    await this.prisma.passwordResetOtp.updateMany({
      where: { email, verified: false },
      data: { verified: true },
    });

    await this.prisma.passwordResetOtp.create({
      data: { email, otp, expiresAt },
    });

    this.mail.sendPasswordResetOtpEmail(
      rawEmail,
      contactName ?? 'there',
      otp,
      this.OTP_EXPIRY_MINUTES,
    );
    this.logger.log(`Password reset OTP sent to ${email}`);

    return { message: genericMessage };
  }

  /**
   * Verifies a password-reset OTP for the given email. Throws on failure.
   * Marks the OTP record verified (single-use) on success.
   */
  async verifyOtp(rawEmail: string, otp: string): Promise<void> {
    const email = this.normalizeEmail(rawEmail);

    const record = await this.prisma.passwordResetOtp.findFirst({
      where: { email, verified: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException(
        'OTP has expired or does not exist. Please request a new one.',
      );
    }

    if (record.attempts >= this.MAX_ATTEMPTS) {
      await this.prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: { verified: true },
      });
      throw new BadRequestException(
        'Maximum OTP attempts exceeded. Please request a new OTP.',
      );
    }

    if (record.otp !== otp) {
      await this.prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      const remainingAttempts = this.MAX_ATTEMPTS - record.attempts - 1;
      throw new BadRequestException(
        `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
      );
    }

    await this.prisma.passwordResetOtp.update({
      where: { id: record.id },
      data: { verified: true },
    });
  }
}
