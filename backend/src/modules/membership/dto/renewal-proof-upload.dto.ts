import { IsInt, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

// Student eligibility proof for an open Release 1 renewal operation.
export class RenewalProofUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  documentType: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalFilename: string;

  @IsString()
  @MaxLength(100)
  mimeType: string;

  @IsInt()
  @IsPositive()
  sizeBytes: number;
}
