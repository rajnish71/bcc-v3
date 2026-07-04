import { IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  // Must already be an active delegate of the group (service-enforced).
  @IsOptional()
  @IsInt()
  @IsPositive()
  primaryContactUserId?: number;
}
