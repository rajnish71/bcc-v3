import { IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitSettlementEvidenceDto {
  // UTR / bank transaction reference. No method (UPI vs Bank Transfer) field
  // here -- Step 11 scope explicitly excludes inventing provider/method
  // identifiers; the reference identifier alone is sufficient to test the
  // manual settlement workflow.
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  referenceIdentifier: string;

  @IsDateString()
  paymentDate: string;

  @IsInt()
  @IsPositive()
  claimedAmountPaise: number;

  // Optional payment-proof reference (Step 13). Both fields are supplied
  // together, returned from a prior request-upload call -- the object key
  // is server-generated (never client-chosen) and re-validated (allowlist +
  // ownership prefix + existence in R2) inside SettlementEvidenceService.submit().
  // proofSizeBytes is deliberately NOT accepted here: it is always derived
  // authoritatively from R2's HEAD response, the same pattern
  // confirmDocumentUpload() uses for membership application documents.
  @IsOptional()
  @IsString()
  @MaxLength(512)
  proofObjectKey?: string;

  @IsOptional()
  @IsIn(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  proofMimeType?: string;
}
