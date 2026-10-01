import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

// Admin request for a settlement correction (HA rulings 1/2). Amount and
// currency are deliberately absent: they are copied from the original
// Contribution server-side, and the global ValidationPipe
// (forbidNonWhitelisted) rejects any client-supplied extra field.
export class SettlementCorrectionDto {
  @IsInt()
  @Min(1)
  originalContributionId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
