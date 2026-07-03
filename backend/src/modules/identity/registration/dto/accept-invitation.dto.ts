import { IsOptional, IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInvitationDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName: string;

  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;
}
