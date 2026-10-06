import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideReinstatementDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
