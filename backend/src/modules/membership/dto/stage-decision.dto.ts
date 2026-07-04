import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StageDecisionDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  // Optional on approval; the service substitutes a default reason when a
  // rejection arrives without one.
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  note?: string;
}
