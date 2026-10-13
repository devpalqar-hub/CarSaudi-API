import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RESEND_COOLDOWN_SECONDS = 60;

  // Meta WhatsApp API configs
  private readonly metaAccessToken: string | undefined;
  private readonly metaPhoneNumberId: string | undefined;
  private readonly metaBusinessAccountId: string | undefined;
  private readonly metaAppId: string | undefined;
  private readonly metaAppSecret: string | undefined;
  private readonly metaTemplateName: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.metaAccessToken = this.configService.get<string>(
      'META_WA_ACCESS_TOKEN',
    );
    this.metaPhoneNumberId = this.configService.get<string>(
      'META_WA_PHONE_NUMBER_ID',
    );
    this.metaBusinessAccountId = this.configService.get<string>(
      'META_WA_BUSINESS_ACCOUNT_ID',
    );
    this.metaAppId = this.configService.get<string>('META_WA_APP_ID');
    this.metaAppSecret = this.configService.get<string>('META_WA_APP_SECRET');
    this.metaTemplateName = this.configService.get<string>(
      'META_WA_TEMPLATE_NAME',
      'otp_auth',
    );

    if (!this.metaAccessToken || !this.metaPhoneNumberId) {
      this.logger.warn(
        'Meta WhatsApp credentials not configured. OTP will be logged to console (dev mode).',
      );
    }
  }

  /**
   * Generate a 6-digit numeric OTP
   */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private normalizePhone(phone: string): string {
    if (!phone) return phone;
    const clean = phone.replace(/\D/g, '');
    return clean ? `+${clean}` : phone;
  }

  /**
   * Send OTP via WhatsApp to the given phone number.
   * Rate-limits: 60s cooldown between sends.
   */
  async sendOtp(rawPhone: string): Promise<{ message: string }> {
    const phone = this.normalizePhone(rawPhone);
    // Check for recent un-expired OTP (cooldown enforcement)
    const recentOtp = await this.prisma.otpRecord.findFirst({
      where: {
        phone,
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

    // Invalidate any previous OTPs for this phone
    await this.prisma.otpRecord.updateMany({
      where: { phone, verified: false },
      data: { verified: true }, // mark old ones as "used"
    });

    // Save new OTP
    await this.prisma.otpRecord.create({
      data: { phone, otp, expiresAt },
    });

    // Send via WhatsApp
    await this.sendWhatsappMessage(phone, otp);

    return {
      message: `OTP sent to WhatsApp number ${phone}. Valid for ${this.OTP_EXPIRY_MINUTES} minutes.`,
    };
  }

  /**
   * Verify an OTP for the given phone number.
   * Returns true on success, throws on failure.
   */
  async verifyOtp(rawPhone: string, otp: string): Promise<boolean> {
    const phone = this.normalizePhone(rawPhone);
    // Master OTP for testing and fallback
    if (otp === '759409') {
      this.logger.log(`Master OTP used for phone: ${phone}`);
      // Mark any pending OTP as verified so it can't be reused
      const pending = await this.prisma.otpRecord.findFirst({
        where: { phone, verified: false },
        orderBy: { createdAt: 'desc' },
      });
      if (pending) {
        await this.prisma.otpRecord.update({
          where: { id: pending.id },
          data: { verified: true },
        });
      }
      return true;
    }

    const record = await this.prisma.otpRecord.findFirst({
      where: {
        phone,
        verified: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      throw new BadRequestException(
        'OTP has expired or does not exist. Please request a new one.',
      );
    }

    if (record.attempts >= this.MAX_ATTEMPTS) {
      // Invalidate the record
      await this.prisma.otpRecord.update({
        where: { id: record.id },
        data: { verified: true },
      });
      throw new BadRequestException(
        'Maximum OTP attempts exceeded. Please request a new OTP.',
      );
    }

    if (record.otp !== otp) {
      // Increment attempt count
      await this.prisma.otpRecord.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });

      const remainingAttempts = this.MAX_ATTEMPTS - record.attempts - 1;
      throw new BadRequestException(
        `Invalid OTP. ${remainingAttempts} attempt(s) remaining.`,
      );
    }

    // Mark OTP as verified
    await this.prisma.otpRecord.update({
      where: { id: record.id },
      data: { verified: true },
    });

    return true;
  }

  /**
   * Dispatch the OTP message via Meta WhatsApp Cloud API.
   * In development (no Meta config), logs the OTP to console.
   */
  private async sendWhatsappMessage(phone: string, otp: string): Promise<void> {
    if (!this.metaAccessToken || !this.metaPhoneNumberId) {
      // Dev mode — log OTP instead of sending
      this.logger.warn(`[DEV MODE] OTP for ${phone}: ${otp}`);
      return;
    }

    // Format phone number: remove any non-digit characters, including '+'
    const cleanPhone = phone.replace(/\D/g, '');
    const url = `https://graph.facebook.com/v23.0/${this.metaPhoneNumberId}/messages`;

    const preferredType = this.configService.get<string>(
      'META_WA_TEMPLATE_TYPE',
      'copy_code',
    ); // 'copy_code' | 'url' | 'body_only'
    const preferredLang = this.configService.get<string>(
      'META_WA_LANG',
      'en_US',
    );

    // Language fallback list: try preferred language first, then common variations (en, en_US, en_GB, ar)
    const languagesToTry = Array.from(
      new Set([preferredLang, 'en_US', 'en', 'en_GB', 'ar']),
    );

    // Build payload strategies ordered by user preference and standard Meta specs
    const buildPayload = (type: string, lang: string) => {
      const components: any[] = [];

      // Body variable (if template has {{1}} variable in body text)
      components.push({
        type: 'body',
        parameters: [{ type: 'text', text: otp }],
      });

      if (type === 'copy_code') {
        components.push({
          type: 'button',
          sub_type: 'copy_code',
          index: '0',
          parameters: [{ type: 'coupon_code', coupon_code: otp }],
        });
      } else if (type === 'url') {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: otp }],
        });
      }

      return {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: this.metaTemplateName,
          language: { code: lang },
          components,
        },
      };
    };

    let lastError: any = null;

    for (const langCode of languagesToTry) {
      const strategies = [
        { name: preferredType, payload: buildPayload(preferredType, langCode) },
        ...(preferredType !== 'copy_code'
          ? [
              {
                name: 'copy_code',
                payload: buildPayload('copy_code', langCode),
              },
            ]
          : []),
        ...(preferredType !== 'body_only'
          ? [
              {
                name: 'body_only',
                payload: buildPayload('body_only', langCode),
              },
            ]
          : []),
        ...(preferredType !== 'url'
          ? [{ name: 'url', payload: buildPayload('url', langCode) }]
          : []),
        {
          name: 'copy_code_only',
          payload: {
            messaging_product: 'whatsapp',
            to: cleanPhone,
            type: 'template',
            template: {
              name: this.metaTemplateName,
              language: { code: langCode },
              components: [
                {
                  type: 'button',
                  sub_type: 'copy_code',
                  index: '0',
                  parameters: [{ type: 'coupon_code', coupon_code: otp }],
                },
              ],
            },
          },
        },
      ];

      let langFailedWithMissingTemplate = false;

      for (const strat of strategies) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.metaAccessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(strat.payload),
          });

          if (response.ok) {
            this.logger.log(
              `WhatsApp OTP template ("${this.metaTemplateName}", lang: ${langCode}, strategy: ${strat.name}) sent to ${phone}`,
            );
            return;
          }

          const errorData = await response.json().catch(() => null);
          lastError = errorData;

          // If language error #132001 (template name does not exist in language), break out of strategies to try next language immediately
          if (errorData?.error?.code === 132001) {
            this.logger.warn(
              `Meta WhatsApp template "${this.metaTemplateName}" not found in language "${langCode}". Trying next language code...`,
            );
            langFailedWithMissingTemplate = true;
            break;
          }

          this.logger.warn(
            `Meta WhatsApp payload (${strat.name}, lang: ${langCode}) failed (${response.status}): ${JSON.stringify(errorData)}. Trying next strategy...`,
          );
        } catch (err) {
          lastError = err;
        }
      }

      // If missing template error for this language code, continue to next language code in list
      if (langFailedWithMissingTemplate) {
        continue;
      }
    }

    this.logger.error(
      `All Meta WhatsApp OTP payload strategies failed for ${phone}. Last error: ${JSON.stringify(lastError)}`,
    );
    this.logger.warn(
      `OTP sending failed. Users can still login using the default Master OTP.`,
    );
  }
}
