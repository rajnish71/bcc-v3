import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RECOGNITION_CODES } from './set-recognition-modifier.dto';
import type { RecognitionCode } from './set-recognition-modifier.dto';

export class AssignRecognitionDto {
  @IsIn(RECOGNITION_CODES)
  recognitionCode: RecognitionCode;

  @IsIn(['AUTO', 'MANUAL'])
  track: 'AUTO' | 'MANUAL';

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;
}
