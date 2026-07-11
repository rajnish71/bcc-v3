import { IsString, IsOptional, MinLength, MaxLength, IsIn } from 'class-validator';

const VALID_TITLES = ['Mr.', 'Ms.', 'Mrs.', 'Dr.', 'Prof.', 'Er.', 'CA', 'Adv.'] as const;

export class UpdateNameDto {
  @IsOptional()
  @IsString()
  @IsIn(VALID_TITLES)
  nameTitle?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;
}
