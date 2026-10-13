import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DealerAddFeaturedDto {
  @ApiProperty({
    description: 'Listing ID to make featured',
    example: 'clxyz123abc',
  })
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @ApiProperty({
    description: 'Featured plan ID to apply',
    example: 'clxyz456def',
  })
  @IsString()
  @IsNotEmpty()
  planId: string;
}
