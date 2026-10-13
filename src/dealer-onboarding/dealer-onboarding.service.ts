import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  AuthProvider,
  DocumentType,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../shared/mail.service';
import { MinioService } from '../shared/minio.service';
import { ApplyStep1Dto } from './dto/apply-step1.dto';
import { ApplyStep2Dto } from './dto/apply-step2.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';

@Injectable()
export class DealerOnboardingService {
  private readonly logger = new Logger(DealerOnboardingService.name);
  private readonly SALT_ROUNDS = 10;
  private readonly EDIT_TOKEN_HOURS = 72;

  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
    private readonly mail: MailService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private generateSubmissionId(): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `DA-${dateStr}-${randomPart}`;
  }

  private generatePassword(): string {
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = upper + lower + digits;
    // Ensure at least one upper + one digit + rest random
    const pwd = [
      upper[Math.floor(Math.random() * upper.length)],
      digits[Math.floor(Math.random() * digits.length)],
      ...Array.from(
        { length: 6 },
        () => all[Math.floor(Math.random() * all.length)],
      ),
    ];
    // Shuffle
    return pwd.sort(() => Math.random() - 0.5).join('');
  }

  // ─── Step 1: Initial Application ─────────────────────────────────────────

  async applyStep1(dto: ApplyStep1Dto) {
    // Check for existing applications with same email that are not yet final
    const existing = await this.prisma.dealerApplication.findFirst({
      where: {
        email: dto.email,
        status: {
          notIn: [ApplicationStatus.APPROVED],
        },
      },
    });

    if (existing) {
      return {
        message: 'An application with this email already exists.',
        submissionId: existing.submissionId,
        status: existing.status,
        currentStep: existing.currentStep,
      };
    }

    // Also check if this email is already an active dealer account
    const activeDealer = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (activeDealer && activeDealer.role === UserRole.DEALER) {
      throw new ConflictException(
        'A dealer account with this email already exists.',
      );
    }

    const submissionId = this.generateSubmissionId();

    const application = await this.prisma.dealerApplication.create({
      data: {
        submissionId,
        dealerName: dto.dealerName,
        contactName: dto.contactName,
        email: dto.email,
        phone: dto.phone,
        status: ApplicationStatus.DRAFT,
        currentStep: 1,
      },
    });

    return {
      message:
        'Application initiated successfully. Proceed to Step 2 to complete your submission.',
      submissionId: application.submissionId,
      applicationId: application.id,
      currentStep: 1,
    };
  }

  // ─── Step 2: Submit Details + Documents ──────────────────────────────────

  async applyStep2(
    submissionId: string,
    dto: ApplyStep2Dto,
    files: Express.Multer.File[],
  ) {
    const application = await this.findBySubmissionId(submissionId);

    if (application.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'This application has already been approved.',
      );
    }

    if (
      application.status === ApplicationStatus.SUBMITTED ||
      application.status === ApplicationStatus.UNDER_REVIEW
    ) {
      throw new BadRequestException(
        'This application has already been submitted. Use the resubmit endpoint if you need to make changes.',
      );
    }

    // Upload documents to MinIO
    const uploadedDocs = await this.uploadDocuments(application.id, files);

    // Update application with step 2 details
    const updated = await this.prisma.dealerApplication.update({
      where: { id: application.id },
      data: {
        tradeNumber: dto.tradeNumber ?? null,
        reraNumber: dto.reraNumber ?? null,
        address: dto.address ?? null,
        city: dto.city ?? null,
        country: dto.country ?? 'Qatar',
        website: dto.website ?? null,
        description: dto.description ?? null,
        additionalContacts: (dto.additionalContacts as any) ?? undefined,
        status: ApplicationStatus.SUBMITTED,
        currentStep: 2,
      },
      include: { documents: true },
    });

    return {
      message:
        'Application submitted successfully. Our team will review it and contact you via email.',
      submissionId: updated.submissionId,
      status: updated.status,
      documentsUploaded: uploadedDocs.length,
    };
  }

  // ─── Document Upload Helper ───────────────────────────────────────────────

  private async uploadDocuments(
    applicationId: string,
    files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) return [];

    const results: any[] = [];

    for (const file of files) {
      // Determine document type from fieldname (e.g. "TRADE_LICENSE")
      const docType = Object.values(DocumentType).includes(
        file.fieldname.toUpperCase() as DocumentType,
      )
        ? (file.fieldname.toUpperCase() as DocumentType)
        : DocumentType.OTHER;

      const ext = file.originalname.split('.').pop();
      const objectKey = `dealer-documents/${applicationId}/${Date.now()}-${randomUUID()}.${ext}`;

      await this.minio.uploadFile(
        file.buffer,
        objectKey,
        file.mimetype,
        file.size,
      );

      const doc = await this.prisma.dealerDocument.create({
        data: {
          applicationId,
          documentType: docType,
          originalName: file.originalname,
          minioKey: objectKey,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });

      results.push(doc);
    }

    return results;
  }

  // ─── Get Status (Public) ──────────────────────────────────────────────────

  async getStatus(submissionId: string) {
    const app = await this.findBySubmissionId(submissionId);

    return {
      submissionId: app.submissionId,
      dealerName: app.dealerName,
      contactName: app.contactName,
      status: app.status,
      currentStep: app.currentStep,
      submittedAt: app.updatedAt,
      latestReview:
        app.status === ApplicationStatus.REJECTED
          ? await this.prisma.applicationReview.findFirst({
              where: { applicationId: app.id },
              orderBy: { reviewedAt: 'desc' },
              select: { action: true, message: true, reviewedAt: true },
            })
          : null,
    };
  }

  // ─── Get by Edit Token (Public) ───────────────────────────────────────────

  async getByEditToken(editToken: string) {
    const app = await this.prisma.dealerApplication.findUnique({
      where: { editToken },
      include: {
        documents: true,
        reviews: { orderBy: { reviewedAt: 'desc' } },
      },
    });

    if (!app) {
      throw new NotFoundException('Invalid or expired edit link.');
    }

    if (app.editTokenExpiry && app.editTokenExpiry < new Date()) {
      throw new BadRequestException(
        'This edit link has expired. Please contact support to request a new one.',
      );
    }

    // Resolve document pre-signed URLs
    const documents = await Promise.all(
      app.documents.map(async (doc) => ({
        ...doc,
        downloadUrl: await this.minio.getPresignedUrl(doc.minioKey),
      })),
    );

    return {
      ...app,
      documents,
      latestRejectionMessage: app.reviews[0]?.message ?? null,
    };
  }

  // ─── Resubmit (Public with edit token) ───────────────────────────────────

  async resubmit(
    editToken: string,
    dto: ApplyStep2Dto,
    files: Express.Multer.File[],
  ) {
    const app = await this.prisma.dealerApplication.findUnique({
      where: { editToken },
    });

    if (!app) {
      throw new NotFoundException('Invalid or expired edit link.');
    }

    if (app.editTokenExpiry && app.editTokenExpiry < new Date()) {
      throw new BadRequestException(
        'This edit link has expired. Please contact support.',
      );
    }

    if (app.status !== ApplicationStatus.REJECTED) {
      throw new BadRequestException(
        'Only rejected applications can be resubmitted.',
      );
    }

    const uploadedDocs = await this.uploadDocuments(app.id, files);

    const updated = await this.prisma.dealerApplication.update({
      where: { id: app.id },
      data: {
        tradeNumber: dto.tradeNumber ?? app.tradeNumber,
        reraNumber: dto.reraNumber ?? app.reraNumber,
        address: dto.address ?? app.address,
        city: dto.city ?? app.city,
        country: dto.country ?? app.country,
        website: dto.website ?? app.website,
        description: dto.description ?? app.description,
        additionalContacts:
          (dto.additionalContacts as any) ?? app.additionalContacts,
        status: ApplicationStatus.RESUBMITTED,
        // Invalidate the edit token after use
        editToken: null,
        editTokenExpiry: null,
      },
    });

    return {
      message:
        'Application resubmitted successfully. Our team will review your updated submission.',
      submissionId: updated.submissionId,
      status: updated.status,
      newDocumentsUploaded: uploadedDocs.length,
    };
  }

  // ─── Admin: List Applications ─────────────────────────────────────────────

  async adminListApplications(query: QueryApplicationsDto) {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { dealerName: { contains: search, mode: 'insensitive' } },
          { contactName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [applications, total] = await Promise.all([
      this.prisma.dealerApplication.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          submissionId: true,
          dealerName: true,
          contactName: true,
          email: true,
          phone: true,
          status: true,
          currentStep: true,
          city: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { documents: true, reviews: true },
          },
        },
      }),
      this.prisma.dealerApplication.count({ where }),
    ]);

    return {
      data: applications,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Admin: Get Single Application ───────────────────────────────────────

  async adminGetApplication(id: string) {
    const app = await this.prisma.dealerApplication.findUnique({
      where: { id },
      include: {
        documents: true,
        reviews: {
          orderBy: { reviewedAt: 'desc' },
          include: {
            reviewedBy: { select: { id: true, name: true, email: true } },
          },
        },
        dealerUser: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!app) {
      throw new NotFoundException(`Application with ID "${id}" not found`);
    }

    // Auto-mark as UNDER_REVIEW when admin opens it for the first time
    if (
      app.status === ApplicationStatus.SUBMITTED ||
      app.status === ApplicationStatus.RESUBMITTED
    ) {
      await this.prisma.dealerApplication.update({
        where: { id },
        data: { status: ApplicationStatus.UNDER_REVIEW },
      });
      app.status = ApplicationStatus.UNDER_REVIEW;
    }

    // Resolve MinIO presigned URLs for documents
    const documents = await Promise.all(
      app.documents.map(async (doc) => ({
        ...doc,
        downloadUrl: await this.minio.getPresignedUrl(doc.minioKey),
      })),
    );

    return { ...app, documents };
  }

  // ─── Admin: Approve Application ───────────────────────────────────────────

  async adminApprove(applicationId: string, reviewedById: string) {
    const app = await this.prisma.dealerApplication.findUnique({
      where: { id: applicationId },
    });

    if (!app) throw new NotFoundException('Application not found');

    if (app.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'This application has already been approved.',
      );
    }

    if (
      app.status === ApplicationStatus.DRAFT ||
      (app.status === ApplicationStatus.SUBMITTED) === false
    ) {
      // allow any non-approved to be approved
    }

    // Generate 8-char password
    const plainPassword = this.generatePassword();
    const hashedPassword = await bcrypt.hash(plainPassword, this.SALT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      // Create dealer user account
      const dealerUser = await tx.user.create({
        data: {
          name: app.contactName,
          email: app.email,
          phone: app.phone,
          password: hashedPassword,
          role: UserRole.DEALER,
          authProvider: AuthProvider.LOCAL,
          isProfileComplete: true,
          isActive: true,
        },
      });

      // Create dealer profile
      await tx.dealerProfile.create({
        data: {
          userId: dealerUser.id,
          dealerName: app.dealerName,
          contactPhone: app.phone,
          tradeNumber: app.tradeNumber ?? null,
          reraNumber: app.reraNumber ?? null,
          address: app.address ?? null,
          city: app.city ?? null,
          country: app.country,
          website: app.website ?? null,
          description: app.description ?? null,
        },
      });

      // Update application status
      await tx.dealerApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.APPROVED,
          dealerUserId: dealerUser.id,
          editToken: null,
          editTokenExpiry: null,
        },
      });

      // Record review in history
      await tx.applicationReview.create({
        data: {
          applicationId,
          action: 'APPROVED',
          message: 'Application approved and dealer account created.',
          reviewedById,
        },
      });

      return dealerUser;
    });

    // Fire-and-forget approval email
    this.mail.sendDealerApprovalEmail(
      app.email,
      app.contactName,
      plainPassword,
    );

    return {
      message: `Dealer account created for ${app.contactName}. Approval email sent to ${app.email}.`,
      dealerUserId: result.id,
      email: app.email,
    };
  }

  // ─── Admin: Reject Application ────────────────────────────────────────────

  async adminReject(
    applicationId: string,
    dto: RejectApplicationDto,
    reviewedById: string,
  ) {
    const app = await this.prisma.dealerApplication.findUnique({
      where: { id: applicationId },
    });

    if (!app) throw new NotFoundException('Application not found');

    if (app.status === ApplicationStatus.APPROVED) {
      throw new BadRequestException(
        'Cannot reject an already approved application.',
      );
    }

    const editToken = randomUUID();
    const editTokenExpiry = new Date(
      Date.now() + this.EDIT_TOKEN_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.$transaction([
      this.prisma.dealerApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.REJECTED,
          editToken,
          editTokenExpiry,
        },
      }),
      this.prisma.applicationReview.create({
        data: {
          applicationId,
          action: 'REJECTED',
          message: dto.message,
          reviewedById,
        },
      }),
    ]);

    // Fire-and-forget rejection email with edit token link
    this.mail.sendDealerRejectionEmail(
      app.email,
      app.contactName,
      dto.message,
      editToken,
    );

    return {
      message: `Application rejected. Rejection email with edit link sent to ${app.email}.`,
      submissionId: app.submissionId,
    };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────

  private async findBySubmissionId(submissionId: string) {
    const app = await this.prisma.dealerApplication.findUnique({
      where: { submissionId },
      include: { documents: true },
    });

    if (!app) {
      throw new NotFoundException(
        `Application with submission ID "${submissionId}" not found`,
      );
    }

    return app;
  }
}
