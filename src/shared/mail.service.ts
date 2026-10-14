import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as nodemailer from 'nodemailer';
import { resolveAssetPath } from './asset-path.util';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}

// Referenced via `cid:` in the header every outgoing email gets, so the logo
// renders inline without depending on a publicly reachable URL.
const LOGO_CID = 'carsaudi-logo';
const LOGO_PATH = resolveAssetPath('logoColor.png');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly logoBuffer: Buffer | null;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'localhost'),
      port: parseInt(this.configService.get<string>('SMTP_PORT', '587')),
      secure: this.configService.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });

    if (fs.existsSync(LOGO_PATH)) {
      this.logoBuffer = fs.readFileSync(LOGO_PATH);
    } else {
      this.logoBuffer = null;
      this.logger.warn(`Email logo not found at ${LOGO_PATH}`);
    }
  }

  /**
   * Fire-and-forget email send. Every email gets the CarSaudi logo
   * prepended as an inline (cid) header image. Never throws — logs error
   * and continues.
   */
  sendMail(options: MailOptions): void {
    const from = this.configService.get<string>(
      'SMTP_FROM',
      'CarSaudi <noreply@carsaudi.com>',
    );

    const attachments = [...(options.attachments ?? [])];
    let html = options.html;

    if (this.logoBuffer) {
      html = `
        <div style="text-align:center; padding:20px 0 8px;">
          <img src="cid:${LOGO_CID}" alt="CarSaudi" style="height:42px; width:auto;" />
        </div>
        ${html}
      `;
      attachments.push({
        filename: 'carsaudi-logo.png',
        content: this.logoBuffer,
        contentType: 'image/png',
        cid: LOGO_CID,
      });
    }

    this.transporter
      .sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html,
        attachments,
      })
      .then(() =>
        this.logger.log(`Email sent to ${options.to}: "${options.subject}"`),
      )
      .catch((err) =>
        this.logger.warn(
          `Email to ${options.to} failed (non-critical): ${err?.message}`,
        ),
      );
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  sendDealerApprovalEmail(
    to: string,
    contactName: string,
    password: string,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );

    this.sendMail({
      to,
      subject: '🎉 Your CarSaudi Dealer Account is Approved!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Welcome to CarSaudi, ${contactName}!</h2>
          <p>Great news — your dealer account application has been <strong>approved</strong>.</p>
          <p>Here are your login credentials:</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; background:#f5f5f5; font-weight:bold;">Email</td>
              <td style="padding: 8px;">${to}</td>
            </tr>
            <tr>
              <td style="padding: 8px; background:#f5f5f5; font-weight:bold;">Temporary Password</td>
              <td style="padding: 8px; font-family: monospace; font-size: 1.2em;">${password}</td>
            </tr>
          </table>
          <a href="${frontendUrl}/dealer/login"
             style="display:inline-block; background:#1a73e8; color:#fff; padding:12px 24px;
                    border-radius:6px; text-decoration:none; font-weight:bold;">
            Login to Your Account →
          </a>
          <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
            Please change your password immediately after logging in.
          </p>
        </div>
      `,
    });
  }

  sendDealerRejectionEmail(
    to: string,
    contactName: string,
    message: string,
    editToken: string,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );
    const editLink = `${frontendUrl}/dealer/application/edit/${editToken}`;

    this.sendMail({
      to,
      subject: 'CarSaudi Dealer Application — Update Required',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d32f2f;">Application Update Required</h2>
          <p>Dear ${contactName},</p>
          <p>Thank you for applying to become a CarSaudi dealer. After reviewing your application,
             we need some additional updates before we can proceed.</p>
          <div style="background:#fff3e0; border-left:4px solid #f57c00; padding:16px; margin:16px 0; border-radius:4px;">
            <strong>Admin Feedback:</strong>
            <p style="margin:8px 0 0;">${message}</p>
          </div>
          <p>Please click the button below to update your application and resubmit:</p>
          <a href="${editLink}"
             style="display:inline-block; background:#f57c00; color:#fff; padding:12px 24px;
                    border-radius:6px; text-decoration:none; font-weight:bold;">
            Edit & Resubmit Application →
          </a>
          <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
            This link is valid for <strong>72 hours</strong>. If it expires, please contact support.
          </p>
        </div>
      `,
    });
  }

  sendStaffWelcomeEmail(
    to: string,
    contactName: string,
    password: string,
    permissions: string[],
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );

    this.sendMail({
      to,
      subject: 'Welcome to CarSaudi Dealer Staff Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Welcome, ${contactName}!</h2>
          <p>You have been added as a staff member by your agency on CarSaudi.</p>
          <p>Here are your login credentials:</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; background:#f5f5f5; font-weight:bold;">Email</td>
              <td style="padding: 8px;">${to}</td>
            </tr>
            <tr>
              <td style="padding: 8px; background:#f5f5f5; font-weight:bold;">Temporary Password</td>
              <td style="padding: 8px; font-family: monospace; font-size: 1.2em;">${password}</td>
            </tr>
          </table>
          <p>Your permissions include: <strong>${permissions.join(', ')}</strong></p>
          <a href="${frontendUrl}/dealer/login"
             style="display:inline-block; background:#1a73e8; color:#fff; padding:12px 24px;
                    border-radius:6px; text-decoration:none; font-weight:bold;">
            Login to Your Account →
          </a>
          <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
            Please change your password immediately after logging in.
          </p>
        </div>
      `,
    });
  }

  // ─── Featured Listing Activated ────────────────────────────────────────────

  /**
   * Sent the moment a FeaturedSubscription becomes PAID or FREE — either instantly
   * (free quota / fully-discounted checkout) or via the Stripe webhook after payment.
   */
  sendFeaturedActivationEmail(
    to: string,
    contactName: string,
    title: string,
    planName: string,
    locations: string[],
    durationDays: number,
    endDate: Date,
    amountPaid: number | null,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );

    const isFree = !amountPaid || amountPaid <= 0;
    const locationLabels = locations
      .map((l) =>
        l
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase()),
      )
      .join(', ');

    this.sendMail({
      to,
      subject: `🚀 "${title}" is now Featured on CarSaudi!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="background: #1a73e8; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 1.4em;">Your Listing is Featured!</h1>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi <strong>${contactName}</strong>,</p>
            <p>Great news — <strong>${title}</strong> is now live in the featured pool and will get extra visibility.</p>
            <table style="border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 0.9em;">
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight:bold; width: 40%;">Plan</td>
                <td style="padding: 8px 12px;">${planName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight:bold;">Placement</td>
                <td style="padding: 8px 12px;">${locationLabels}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight:bold;">Duration</td>
                <td style="padding: 8px 12px;">${durationDays} days</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight:bold;">Active Until</td>
                <td style="padding: 8px 12px;">${endDate.toDateString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight:bold;">Amount</td>
                <td style="padding: 8px 12px;">${isFree ? 'Free (subscription quota / discount)' : `SAR ${amountPaid.toFixed(2)}`}</td>
              </tr>
            </table>
            <a href="${frontendUrl}/dealer/listings"
               style="display:inline-block; background:#1a73e8; color:#fff; padding:12px 24px;
                      border-radius:6px; text-decoration:none; font-weight:bold;">
              View Your Listings →
            </a>
            <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
              Thank you for using <strong>CarSaudi</strong>.
            </p>
          </div>
        </div>
      `,
    });
  }

  // ─── Listing Approved / Rejected ───────────────────────────────────────────

  sendListingApprovedEmail(
    to: string,
    contactName: string,
    title: string,
    listingSlugOrId: string,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );
    const listingUrl = `${frontendUrl}/listings/${listingSlugOrId}`;

    this.sendMail({
      to,
      subject: `✅ "${title}" is now live on CarSaudi!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #388e3c;">Your listing has been approved!</h2>
          <p>Hi ${contactName},</p>
          <p><strong>${title}</strong> has been reviewed and approved — it's now live and visible to everyone on CarSaudi.</p>
          <a href="${listingUrl}"
             style="display:inline-block; background:#388e3c; color:#fff; padding:12px 24px;
                    border-radius:6px; text-decoration:none; font-weight:bold;">
            View Your Listing →
          </a>
          <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
            Thank you for using <strong>CarSaudi</strong>.
          </p>
        </div>
      `,
    });
  }

  /** Sent when a listing's content is approved but it's outside the free quota — payment is needed to go live. */
  sendListingApprovalPaymentRequiredEmail(
    to: string,
    contactName: string,
    title: string,
    price: number,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );

    this.sendMail({
      to,
      subject: `✅ "${title}" approved — payment needed to publish`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Your listing was approved!</h2>
          <p>Hi ${contactName},</p>
          <p><strong>${title}</strong> passed review. One last step — a one-time payment of
             <strong>SAR ${price.toFixed(2)}</strong> is needed to publish it live on CarSaudi.</p>
          <a href="${frontendUrl}/my-listings"
             style="display:inline-block; background:#1a73e8; color:#fff; padding:12px 24px;
                    border-radius:6px; text-decoration:none; font-weight:bold;">
            Pay & Publish Now →
          </a>
          <p style="margin-top: 20px; color: #666; font-size: 0.9em;">
            Your listing will go live automatically the moment payment is confirmed.
          </p>
        </div>
      `,
    });
  }

  sendListingRejectedEmail(
    to: string,
    contactName: string,
    title: string,
    message: string,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );

    this.sendMail({
      to,
      subject: `Update needed for "${title}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d32f2f;">Your listing needs changes</h2>
          <p>Hi ${contactName},</p>
          <p>We reviewed <strong>${title}</strong> and it wasn't approved as submitted.</p>
          <div style="background:#fff3e0; border-left:4px solid #f57c00; padding:16px; margin:16px 0; border-radius:4px;">
            <strong>Reviewer Feedback:</strong>
            <p style="margin:8px 0 0;">${message}</p>
          </div>
          <p>You can update and resubmit it from your listings dashboard.</p>
          <a href="${frontendUrl}/my-listings"
             style="display:inline-block; background:#f57c00; color:#fff; padding:12px 24px;
                    border-radius:6px; text-decoration:none; font-weight:bold;">
            Go to My Listings →
          </a>
        </div>
      `,
    });
  }

  // ─── Forgot Password (OTP) ──────────────────────────────────────────────────

  sendPasswordResetOtpEmail(
    to: string,
    contactName: string,
    otp: string,
    expiryMinutes: number,
  ): void {
    this.sendMail({
      to,
      subject: 'Your CarSaudi password reset code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a73e8;">Reset your password</h2>
          <p>Hi ${contactName},</p>
          <p>We received a request to reset your CarSaudi account password. Use the code below to continue:</p>
          <div style="background:#f5f5f5; border-radius:8px; padding:20px; text-align:center; margin:20px 0;">
            <span style="font-family: monospace; font-size: 2em; letter-spacing: 6px; font-weight:bold; color:#1a73e8;">${otp}</span>
          </div>
          <p style="color: #666; font-size: 0.9em;">
            This code expires in <strong>${expiryMinutes} minutes</strong>. If you didn't request a password reset,
            you can safely ignore this email — your password will not be changed.
          </p>
        </div>
      `,
    });
  }

  // ─── Support Ticket Reply ──────────────────────────────────────────────────

  /**
   * Sends a reply notification email to a support ticket submitter.
   * @param to         Submitter email
   * @param userName   Submitter display name
   * @param subject    Original ticket subject
   * @param reply      Admin's reply message
   * @param ticketId   Ticket reference ID
   * @param status     Current ticket status after the reply
   */
  sendTicketReplyEmail(
    to: string,
    userName: string,
    subject: string,
    reply: string,
    ticketId: string,
    status: string,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.carsaudi.com',
    );

    const statusColorMap: Record<string, string> = {
      OPEN: '#1a73e8',
      IN_PROGRESS: '#f57c00',
      ATTENDED: '#388e3c',
      CLOSED: '#757575',
    };

    const statusColor = statusColorMap[status] ?? '#1a73e8';
    const ticketLink = `${frontendUrl}/support/tickets/${ticketId}`;

    this.sendMail({
      to,
      subject: `Re: [#${ticketId.slice(-8).toUpperCase()}] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">

          <!-- Header -->
          <div style="background: #1a73e8; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 1.4em;">CarSaudi Support</h1>
          </div>

          <!-- Body -->
          <div style="background: #fff; padding: 32px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="margin-top: 0;">Hi <strong>${userName}</strong>,</p>
            <p>Our support team has responded to your ticket. Here are the details:</p>

            <!-- Ticket info -->
            <table style="width:100%; border-collapse: collapse; margin-bottom: 24px; font-size: 0.9em;">
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight: bold; width: 35%;">Ticket Reference</td>
                <td style="padding: 8px 12px;">#${ticketId.slice(-8).toUpperCase()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight: bold;">Subject</td>
                <td style="padding: 8px 12px;">${subject}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background:#f5f5f5; font-weight: bold;">Current Status</td>
                <td style="padding: 8px 12px;">
                  <span style="display:inline-block; background:${statusColor}; color:#fff;
                               padding: 3px 10px; border-radius: 12px; font-size: 0.85em; font-weight: bold;">
                    ${status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            </table>

            <!-- Admin reply -->
            <div style="background: #f0f7ff; border-left: 4px solid #1a73e8; padding: 16px 20px;
                        border-radius: 4px; margin-bottom: 24px;">
              <p style="margin: 0 0 6px; font-weight: bold; color: #1a73e8; font-size: 0.85em;">
                SUPPORT TEAM REPLY
              </p>
              <p style="margin: 0; line-height: 1.6; white-space: pre-wrap;">${reply}</p>
            </div>

            <!-- CTA -->
            <a href="${ticketLink}"
               style="display: inline-block; background: #1a73e8; color: #fff; padding: 12px 28px;
                      border-radius: 6px; text-decoration: none; font-weight: bold; margin-bottom: 24px;">
              View Your Ticket →
            </a>

            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />

            <p style="color: #666; font-size: 0.85em; margin: 0;">
              If you have further questions, you can reply to this ticket from your account.<br />
              Thank you for contacting <strong>CarSaudi Support</strong>.
            </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; padding: 16px; color: #999; font-size: 0.8em;">
            © ${new Date().getFullYear()} CarSaudi. All rights reserved.
          </div>
        </div>
      `,
    });
  }
}
