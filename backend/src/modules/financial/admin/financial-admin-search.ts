// backend/src/modules/financial/admin/financial-admin-search.ts
//
// Track 4 controlled financial search -- the FIXED, explicitly approved
// field set. buildSearchTerms() turns the user's input into a list of
// (field, value) terms; FinancialAdminService applies each field through a
// hard-coded, parameterized Kysely predicate. User input is only ever a
// bound value -- never a column name, operator or SQL fragment.
//
// Not searchable, by construction: BCCTemp / membership_temp_identifiers,
// payer_user_id or any numeric id, email, audit/security metadata, and
// settlement-evidence storage details.

import { BadRequestException } from '@nestjs/common';
import { PERMANENT_MEMBERSHIP_NUMBER } from './financial-admin.mappers';

export const SEARCH_FIELDS = [
  'CONTRIBUTION_REFERENCE', // financial_contributions.uuid (prefix)
  'RECEIPT_NUMBER',         // receipts.receipt_number (contains)
  'PROVIDER_REFERENCE',     // financial_transactions / financial_refunds provider_reference, contribution active_settlement_reference (exact)
  'CONTRIBUTOR_NAME',       // users.full_name (contains)
  'CONTRIBUTOR_USERNAME',   // users.username (contains)
  'MEMBERSHIP_NUMBER',      // memberships.membership_number (exact, permanent MEM-007 format only)
] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export interface SearchTerm {
  field: SearchField;
  value: string;
}

const UUID_PREFIX = /^[0-9a-f-]{8,36}$/i;
const BCC_TEMP = /^bcc\s*temp/i;

// Escapes LIKE wildcards so user input matches literally (MySQL default
// escape character is backslash).
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// MEM-007: BCCTemp identifiers are never exposed or searchable. Shared by
// unified search and the receipts contributor filter.
export function rejectTemporaryIdentifier(q: string): void {
  if (BCC_TEMP.test(q)) {
    throw new BadRequestException('Temporary membership identifiers are not searchable');
  }
}

export function buildSearchTerms(raw: string): SearchTerm[] {
  const q = raw.trim();
  if (q.length < 2) throw new BadRequestException('q must be at least 2 characters');
  rejectTemporaryIdentifier(q);

  const like = escapeLike(q);
  const terms: SearchTerm[] = [
    { field: 'RECEIPT_NUMBER', value: `%${like}%` },
    { field: 'PROVIDER_REFERENCE', value: q },
    { field: 'CONTRIBUTOR_NAME', value: `%${like}%` },
    { field: 'CONTRIBUTOR_USERNAME', value: `%${like}%` },
  ];
  if (UUID_PREFIX.test(q)) terms.unshift({ field: 'CONTRIBUTION_REFERENCE', value: `${like.toLowerCase()}%` });
  if (PERMANENT_MEMBERSHIP_NUMBER.test(q.toUpperCase())) terms.push({ field: 'MEMBERSHIP_NUMBER', value: q.toUpperCase() });
  return terms;
}
