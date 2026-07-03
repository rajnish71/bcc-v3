import { IsEmail, IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminCreateAccountDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName: string;

  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;
}
