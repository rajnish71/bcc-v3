import { IsEmail } from 'class-validator';

export class InitiateEmailChangeDto {
  @IsEmail()
  newEmail: string;
}
