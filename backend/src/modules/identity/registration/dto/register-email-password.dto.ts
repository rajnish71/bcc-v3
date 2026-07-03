import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterEmailPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName: string;
}
