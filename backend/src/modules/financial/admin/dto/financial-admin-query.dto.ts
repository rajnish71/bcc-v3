import { IsIn, IsNumberString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CONTRIBUTION_STATES } from '../../financial.types';
import { EXCEPTION_CATEGORIES, REFUND_STATUSES } from '../financial-admin.mappers';

// Query strings arrive as strings (the global ValidationPipe does not
// transform); page/pageSize are parsed and clamped server-side by
// clampPage() -- pageSize above MAX_PAGE_SIZE is clamped, never honoured.
export class FinancialAdminPageQueryDto {
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  page?: string;

  @IsOptional()
  @IsNumberString({ no_symbols: true })
  pageSize?: string;
}

// business_module is generic (PAY-001): validated by shape, not by a
// hard-coded module list, so any existing/future Business Module works.
export class FinancialAdminContributionsQueryDto extends FinancialAdminPageQueryDto {
  @IsOptional()
  @IsIn(CONTRIBUTION_STATES as unknown as string[])
  state?: string;

  @IsOptional()
  @Matches(/^[A-Z][A-Z_]{0,63}$/)
  businessModule?: string;
}

export class FinancialAdminRefundsQueryDto extends FinancialAdminPageQueryDto {
  @IsOptional()
  @IsIn(REFUND_STATUSES as unknown as string[])
  status?: string;
}

export class FinancialAdminExceptionsQueryDto extends FinancialAdminPageQueryDto {
  @IsOptional()
  @IsIn(EXCEPTION_CATEGORIES as unknown as string[])
  category?: string;
}

export class FinancialAdminSearchQueryDto extends FinancialAdminPageQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  q!: string;
}
