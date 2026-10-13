import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@prisma/client';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { DealerOnboardingService } from './dealer-onboarding.service';
import { ApplyStep1Dto } from './dto/apply-step1.dto';
import { ApplyStep2Dto } from './dto/apply-step2.dto';
import { QueryApplicationsDto } from './dto/query-applications.dto';
import { RejectApplicationDto } from './dto/reject-application.dto';

@ApiTags('Dealer Onboarding')
@Controller('dealer-onboarding')
export class DealerOnboardingController {
  constructor(private readonly service: DealerOnboardingService) {}

  // ─── Public: Step 1 ────────────────────────────────────────────────────────

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Step 1 — Initiate dealer application',
    description:
      'Submit initial information (dealer name, contact, email, phone). ' +
      'Returns a **submissionId** to be used in Step 2.',
  })
  @ApiResponse({
    status: 201,
    description: 'Application initiated — use submissionId for Step 2',
    schema: {
      example: {
        message: 'Application initiated. Proceed to Step 2.',
        submissionId: 'DA-20240714-A1B2',
        currentStep: 1,
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Email already registered as dealer',
  })
  applyStep1(@Body() dto: ApplyStep1Dto) {
    return this.service.applyStep1(dto);
  }

  // ─── Public: Step 2 ────────────────────────────────────────────────────────

  @Post(':submissionId/details')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FilesInterceptor('documents', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'),
            false,
          );
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Step 2 — Submit full application details + documents',
    description:
      'Submit detailed business info and upload supporting documents.\n\n' +
      '**File field name**: `documents` (multiple files allowed)\n\n' +
      '**File types**: PDF, JPG, PNG, DOC, DOCX (max 10MB each, max 10 files)\n\n' +
      "**Document type** is inferred from the file's fieldname:\n" +
      '`TRADE_LICENSE`, `ID_CARD`, `PASSPORT`, `BUSINESS_REGISTRATION`, `RERA_CERTIFICATE`, `OTHER`',
  })
  @ApiParam({
    name: 'submissionId',
    description: 'Submission ID from Step 1',
    example: 'DA-20240714-A1B2',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tradeNumber: { type: 'string', example: '12345/2024' },
        reraNumber: { type: 'string', example: 'RERA-2024-67890' },
        address: { type: 'string', example: 'Office 12, Al Sadd Street' },
        city: { type: 'string', example: 'Doha' },
        country: { type: 'string', example: 'Qatar' },
        website: { type: 'string', example: 'https://pearlrealestate.qa' },
        description: {
          type: 'string',
          example: 'Luxury real estate agency...',
        },
        documents: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Application submitted for review' })
  @ApiResponse({
    status: 400,
    description: 'Application already submitted or invalid status',
  })
  @ApiResponse({ status: 404, description: 'Submission ID not found' })
  applyStep2(
    @Param('submissionId') submissionId: string,
    @Body() dto: ApplyStep2Dto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.applyStep2(submissionId, dto, files ?? []);
  }

  // ─── Public: Status Check ──────────────────────────────────────────────────

  @Get('status/:submissionId')
  @ApiOperation({
    summary: 'Check application status',
    description:
      'Returns current status and latest rejection message if applicable.',
  })
  @ApiParam({ name: 'submissionId', example: 'DA-20240714-A1B2' })
  @ApiResponse({ status: 200, description: 'Application status' })
  @ApiResponse({ status: 404, description: 'Not found' })
  getStatus(@Param('submissionId') submissionId: string) {
    return this.service.getStatus(submissionId);
  }

  // ─── Public: Get by Edit Token ─────────────────────────────────────────────

  @Get('edit/:editToken')
  @ApiOperation({
    summary: 'Get application data using edit token (from rejection email)',
    description:
      'Used by the frontend edit page. Returns application data including rejection message and document download URLs.',
  })
  @ApiParam({
    name: 'editToken',
    description: 'Edit token from the rejection email link',
  })
  @ApiResponse({
    status: 200,
    description: 'Application data with presigned document URLs',
  })
  @ApiResponse({ status: 400, description: 'Edit token expired' })
  @ApiResponse({ status: 404, description: 'Invalid edit token' })
  getByEditToken(@Param('editToken') editToken: string) {
    return this.service.getByEditToken(editToken);
  }

  // ─── Public: Resubmit ─────────────────────────────────────────────────────

  @Put('resubmit/:editToken')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FilesInterceptor('documents', 10, {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        cb(null, allowed.includes(file.mimetype));
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Resubmit application after rejection',
    description:
      'Update application details and/or upload new documents after receiving a rejection.\n\n' +
      'The edit token is **invalidated after use**. A new rejection will send a fresh token.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tradeNumber: { type: 'string', example: '12345/2024' },
        reraNumber: { type: 'string', example: 'RERA-2024-67890' },
        address: { type: 'string', example: 'Office 12, Al Sadd Street' },
        city: { type: 'string', example: 'Doha' },
        country: { type: 'string', example: 'Qatar' },
        website: { type: 'string', example: 'https://pearlrealestate.qa' },
        description: {
          type: 'string',
          example: 'Luxury real estate agency...',
        },
        documents: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiParam({
    name: 'editToken',
    description: 'Edit token from rejection email',
  })
  @ApiResponse({ status: 200, description: 'Application resubmitted' })
  @ApiResponse({
    status: 400,
    description: 'Token expired or application not rejected',
  })
  @ApiResponse({ status: 404, description: 'Invalid token' })
  resubmit(
    @Param('editToken') editToken: string,
    @Body() dto: ApplyStep2Dto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.resubmit(editToken, dto, files ?? []);
  }

  // ─── Admin: List Applications ──────────────────────────────────────────────

  @Get('admin/applications')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEALERS_APPLICATIONS_REVIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '[Admin] List all dealer applications',
    description:
      'Paginated list with optional filters. Requires SUPER_ADMIN or MODERATOR with `MANAGE_DEALERS`.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of applications' })
  adminListApplications(@Query() query: QueryApplicationsDto) {
    return this.service.adminListApplications(query);
  }

  // ─── Admin: Get Single Application ────────────────────────────────────────

  @Get('admin/applications/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEALERS_APPLICATIONS_REVIEW)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: '[Admin] View application details + documents + review history',
    description:
      'Opens the full application. Automatically sets status to `UNDER_REVIEW` on first open.',
  })
  @ApiParam({ name: 'id', description: 'Application CUID' })
  @ApiResponse({
    status: 200,
    description:
      'Full application with presigned document URLs and review history',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  adminGetApplication(@Param('id') id: string) {
    return this.service.adminGetApplication(id);
  }

  // ─── Admin: Approve ────────────────────────────────────────────────────────

  @Post('admin/applications/:id/approve')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEALERS_APPLICATIONS_REVIEW)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Approve dealer application',
    description:
      'Creates a Dealer account with an 8-character generated password and sends an approval email.\n\n' +
      'If email sending fails, the API still completes successfully.',
  })
  @ApiParam({ name: 'id', description: 'Application CUID' })
  @ApiResponse({
    status: 200,
    description: 'Dealer account created, approval email sent',
  })
  @ApiResponse({ status: 400, description: 'Already approved' })
  @ApiResponse({ status: 404, description: 'Not found' })
  adminApprove(
    @Param('id') applicationId: string,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.service.adminApprove(applicationId, reviewerId);
  }

  // ─── Admin: Reject ─────────────────────────────────────────────────────────

  @Post('admin/applications/:id/reject')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.DEALERS_APPLICATIONS_REVIEW)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Reject dealer application',
    description:
      'Rejects the application with a message. Generates a 72-hour edit token and sends a rejection email ' +
      'with an edit link.\n\n' +
      'If email sending fails, the API still completes successfully.',
  })
  @ApiParam({ name: 'id', description: 'Application CUID' })
  @ApiResponse({
    status: 200,
    description: 'Application rejected, rejection email sent',
  })
  @ApiResponse({
    status: 400,
    description: 'Already approved or invalid state',
  })
  @ApiResponse({ status: 404, description: 'Not found' })
  adminReject(
    @Param('id') applicationId: string,
    @Body() dto: RejectApplicationDto,
    @CurrentUser('id') reviewerId: string,
  ) {
    return this.service.adminReject(applicationId, dto, reviewerId);
  }
}
