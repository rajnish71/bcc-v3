import { IsIn, IsInt, IsPositive } from 'class-validator';

export class RequestEvidenceProofUploadDto {
  @IsIn(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
  mimeType: string;

  @IsInt()
  @IsPositive()
  sizeBytes: number;
}
