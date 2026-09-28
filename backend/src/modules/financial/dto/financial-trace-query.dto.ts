import { IsIn, IsNumberString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// Query strings arrive as strings (the global ValidationPipe does not
// transform), so contributionId/live are parsed in the controller.
export class FinancialTraceQueryDto {
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  contributionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  orderRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  paymentRef?: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  live?: string;
}
