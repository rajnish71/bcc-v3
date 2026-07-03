import { IsPhoneNumber, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class VerifyPhoneOtpDto {
  @IsPhoneNumber('IN')
  phone: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName: string;
}
