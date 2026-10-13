import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AppService } from './app.service';
import { MinioService } from './shared/minio.service';
import { WatermarkService } from './shared/watermark.service';
import { OptionalJwtAuthGuard } from './auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from './auth/decorators/current-user.decorator';
import { UploadFileDto } from './dto/upload-file.dto';
import { v4 as uuidv4 } from 'uuid';

@ApiTags('App / General')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly minioService: MinioService,
    private readonly watermarkService: WatermarkService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('upload')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Upload a file (Returns a direct public URL). Images uploaded without authentication are always watermarked; pass watermark=true to also watermark an authenticated upload.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        watermark: {
          type: 'boolean',
          default: false,
          description:
            'Stamp the VillasQatar watermark on the image even when the uploader is authenticated.',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadFileDto,
    @CurrentUser() user?: { id: string },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const shouldWatermark = !user || body.watermark === true;
    const rawBuffer = Buffer.from(file.buffer);
    const buffer: Buffer =
      shouldWatermark && file.mimetype.startsWith('image/')
        ? await this.watermarkService.applyWatermark(rawBuffer)
        : rawBuffer;

    const ext = file.originalname.split('.').pop() ?? 'bin';
    const key = `public/uploads/${uuidv4()}.${ext}`;

    await this.minioService.uploadFile(
      buffer,
      key,
      file.mimetype,
      buffer.length,
    );

    const url = this.minioService.getDirectUrl(key);
    return { url, key };
  }
}
