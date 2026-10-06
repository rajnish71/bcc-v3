import { IsString, MaxLength, MinLength } from 'class-validator';

// Admin refund of a paid, not-yet-fulfilled merchandise order. Amount is
// deliberately absent: the Financial Engine refunds the Contribution's own
// amount, and the global ValidationPipe rejects any extra field.
export class RefundOrderDto {
  @IsString()
  @MinLength(5)
  @MaxLength(450)
  reason: string;
}
