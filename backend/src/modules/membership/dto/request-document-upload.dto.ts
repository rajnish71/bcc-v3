import { IsIn, IsInt, IsPositive, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RequestDocumentUploadDto {
  // Free-form-but-shaped label -- spec 02.4 says required documents are
  // configurable per class, so no closed enum here.
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: 'documentType must be UPPER_SNAKE (e.g. ID_PROOF, STUDENT_ID)' })
  @MinLength(2)
  @MaxLength(50)
  documentType: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  originalFilename: string;

  @IsIn(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  mimeType: string;

  @IsInt()
  @IsPositive()
  sizeBytes: number;
}
