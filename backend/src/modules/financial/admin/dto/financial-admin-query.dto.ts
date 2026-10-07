import { IsIn, IsNumberString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CONTRIBUTION_STATES } from '../../financial.types';
import { EXCEPTION_CATEGORIES, REFUND_STATUSES } from '../financial-admin.mappers';
import { CLASSIFICATION_FILTERS } from '../financial-admin-classification';
import { RECEIPT_SORT_KEYS, RECEIPT_STATUS_FILTERS, SORT_ORDERS } from '../financial-admin-receipts';

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

  // TEST_MODE = has a recognised TEST_MODE_NON_GENUINE_SETTLEMENT annotation;
  // UNCLASSIFIED = has none ("Not classified" -- never "Genuine").
  @IsOptional()
  @IsIn(CLASSIFICATION_FILTERS as unknown as string[])
  classification?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Receipts list (C2). `state` may repeat (?state=COMPLETED&state=REVIEW):
// values OR together; different filters AND together. REVIEW ("Needs
// review") is a display/filter condition over the review flags, not a
// financial state. Dates are Asia/Kolkata calendar days on issued_at.
// sort/order are fixed allow-lists; unknown values -> 400.
export class FinancialAdminReceiptsQueryDto extends FinancialAdminPageQueryDto {
  @IsOptional()
  @IsIn(RECEIPT_STATUS_FILTERS as unknown as string[], { each: true })
  state?: string | string[];

  @IsOptional()
  @Matches(/^[A-Z][A-Z_]{0,63}$/)
  businessModule?: string;

  @IsOptional()
  @IsIn(CLASSIFICATION_FILTERS as unknown as string[])
  classification?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  issuedFrom?: string;

  @IsOptional()
  @Matches(ISO_DATE)
  issuedTo?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{1,40}$/)
  receiptNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  q?: string;

  @IsOptional()
  @IsIn(RECEIPT_SORT_KEYS as unknown as string[])
  sort?: string;

  @IsOptional()
  @IsIn(SORT_ORDERS as unknown as string[])
  order?: string;
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
