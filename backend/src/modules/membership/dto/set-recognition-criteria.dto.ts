import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { RECOGNITION_CODES, RecognitionCode } from './set-recognition-modifier.dto';

export class SetRecognitionCriteriaDto {
  @IsIn(RECOGNITION_CODES)
  recognitionCode: RecognitionCode;

  @IsString()
  @Matches(/^[a-z0-9_.]+$/)
  @MinLength(2)
  @MaxLength(100)
  criteriaKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  criteriaValue: string;
}
