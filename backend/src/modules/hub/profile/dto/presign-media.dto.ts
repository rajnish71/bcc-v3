import { IsString, IsIn, IsNumber, Min, Max } from 'class-validator';

export class PresignMediaDto {
  @IsString() @IsIn(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']) mimeType!: string;
  @IsNumber() @Min(1) @Max(10 * 1024 * 1024) fileSizeBytes!: number;
}

export class ConfirmMediaDto {
  @IsString() r2Key!: string;
}
