import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class DowngradeMembershipDto {
  @IsInt()
  @IsPositive()
  newClassId: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
