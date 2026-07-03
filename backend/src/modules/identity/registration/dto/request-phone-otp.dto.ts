import { IsPhoneNumber } from 'class-validator';

export class RequestPhoneOtpDto {
  @IsPhoneNumber('IN')
  phone: string;
}
