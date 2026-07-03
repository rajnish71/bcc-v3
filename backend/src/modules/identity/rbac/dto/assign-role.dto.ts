import { IsInt, IsOptional, IsString, IsDateString } from 'class-validator';

export class AssignRoleDto {
  @IsInt()
  userId: number;

  @IsString()
  roleName: string;

  @IsOptional()
  @IsString()
  scopeType?: string;

  @IsOptional()
  @IsInt()
  scopeId?: number;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
