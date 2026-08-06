import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class UpgradeMembershipDto {
  @IsInt()
  @IsPositive()
  newClassId: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
