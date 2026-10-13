import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UploadFileDto {
  @ApiPropertyOptional({
    description:
      'When true, stamps the VillasQatar watermark onto the uploaded image even for an authenticated user. Unauthenticated uploads are always watermarked regardless of this flag.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  watermark?: boolean;
}
