// backend/src/modules/financial/admin/financial-admin.controller.ts
//
// Track 4 -- Admin Financial Visibility HTTP surface. READ ONLY.
//
// Route prefix: api/v1/financial/admin -- the established module-scoped
// admin convention (api/v1/financial/admin/trace, api/v1/merchandise/admin).
// Distinct from the member-owner route GET api/v1/financial/contributions/:id
// in FinancialController, whose owner semantics are untouched; this
// controller never calls assertOwnedContribution() and addresses
// contributions by UUID only.
//
// Authorization: every route requires financial.read (class-level
// AccessTokenGuard + RbacGuard). financial.read is granted to Super Admin
// and Financial Authority only (migration 0114). It is independent of
// financial.settlement.verify and financial.audit.view.
//
// GET-only by design: no refund, settlement, reconciliation or evidence
// mutation exists here.
//
// Errors: 401 no/invalid token · 403 missing financial.read · 400 invalid
// query (unknown parameter, bad state/category/status, q < 2 chars, BCCTemp
// search) · 404 unknown contribution reference.

import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { RbacGuard } from '../../identity/rbac/rbac.guard';
import { RequirePermissions } from '../../identity/rbac/permissions.decorator';
import { FinancialAdminService } from './financial-admin.service';
import { FINANCIAL_READ_PERMISSION } from './financial-admin.mappers';
import {
  FinancialAdminContributionsQueryDto,
  FinancialAdminExceptionsQueryDto,
  FinancialAdminPageQueryDto,
  FinancialAdminRefundsQueryDto,
  FinancialAdminSearchQueryDto,
} from './dto/financial-admin-query.dto';

@Controller('api/v1/financial/admin')
@UseGuards(AccessTokenGuard, RbacGuard)
@RequirePermissions(FINANCIAL_READ_PERMISSION)
export class FinancialAdminController {
  constructor(private readonly service: FinancialAdminService) {}

  // Canonical counts by state / business module / refund status, receipts
  // issued, and exception counts. No accounting metrics.
  @Get('overview')
  @HttpCode(200)
  overview() {
    return this.service.overview();
  }

  // Paginated { items, page, pageSize, total }. Filters: state, businessModule.
  @Get('contributions')
  @HttpCode(200)
  contributions(@Query() query: FinancialAdminContributionsQueryDto) {
    return this.service.listContributions(query);
  }

  // :reference is the contribution UUID.
  @Get('contributions/:reference')
  @HttpCode(200)
  contribution(@Param('reference', new ParseUUIDPipe()) reference: string) {
    return this.service.getContribution(reference);
  }

  // financial_refunds as stored. Filter: status.
  @Get('refunds')
  @HttpCode(200)
  refunds(@Query() query: FinancialAdminRefundsQueryDto) {
    return this.service.listRefunds(query);
  }

  @Get('receipts')
  @HttpCode(200)
  receipts(@Query() query: FinancialAdminPageQueryDto) {
    return this.service.listReceipts(query);
  }

  // Filter: category (default AWAITING_SETTLEMENT_OVERDUE). Includes
  // per-category counts.
  @Get('exceptions')
  @HttpCode(200)
  exceptions(@Query() query: FinancialAdminExceptionsQueryDto) {
    return this.service.listExceptions(query);
  }

  // Fixed-field search (see financial-admin-search.ts SEARCH_FIELDS).
  @Get('search')
  @HttpCode(200)
  search(@Query() query: FinancialAdminSearchQueryDto) {
    return this.service.search(query);
  }
}
