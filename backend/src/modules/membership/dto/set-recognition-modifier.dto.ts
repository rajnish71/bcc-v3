import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const RECOGNITION_CODES = [
  'SENIOR_MEMBER',
  'HONORARY_SENIOR_MEMBER',
  'HONORARY_MEMBER',
  'HONORARY_MENTOR',
  'HONORARY_GRANDMASTER',
] as const;

export type RecognitionCode = (typeof RECOGNITION_CODES)[number];

export class SetRecognitionModifierDto {
  @IsIn(RECOGNITION_CODES)
  recognitionCode: RecognitionCode;

  @IsString()
  @Matches(/^[a-z0-9_.]+$/)
  @MinLength(2)
  @MaxLength(100)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  value: string;
}
