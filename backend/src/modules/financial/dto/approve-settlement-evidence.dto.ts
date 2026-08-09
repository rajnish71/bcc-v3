import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveSettlementEvidenceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}
