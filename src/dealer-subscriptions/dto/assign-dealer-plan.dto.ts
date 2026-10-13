import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignDealerPlanDto {
  @ApiProperty({
    description: 'The dealer user ID to assign the plan to',
    example: 'clxyz1234',
  })
  @IsString()
  @IsNotEmpty()
  dealerId: string;
}
