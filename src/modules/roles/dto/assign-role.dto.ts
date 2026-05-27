import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsString } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({
    description: 'Role names to assign to the user',
    example: ['MODERATOR', 'DEALER'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roles: string[];
}
