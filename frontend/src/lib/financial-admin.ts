/**
 * financial-admin.ts — shared client helpers for the Track 4 Admin
 * Financial Visibility workspace (/hub/admin/financial/*). READ ONLY.
 *
 * Every value rendered comes from GET /api/v1/financial/admin/* (gated
 * server-side by financial.read). This module only fetches, escapes and
 * formats — it never issues a mutating request.
 */

export const FINANCIAL_ADMIN_API = '/api/v1/financial/admin';
export const NO_RECEIPT_LABEL = 'No receipt issued';
export const DETAIL_HREF = '/hub/admin/financial/contributions/detail/';

export class FinancialAccessError extends Error {}

export async function getJson<T>(path: string): Promise<T> {
  const token = localStorage.getItem('bcc_token') ?? '';
  const res = await fetch(`${FINANCIAL_ADMIN_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new FinancialAccessError('You do not have access to financial records.');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
    } catch { /* non-JSON error body */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(paise: number, currency: string): string {
  const amount = (Number(paise) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Canonical PAY-001 state → existing V6 tag-pill tone. Display only; the
// state text itself is always shown verbatim.
const TONE: Record<string, string> = {
  COMPLETED: 'green', SETTLED: 'green', SUCCEEDED: 'green', APPROVED: 'green',
  FAILED: 'red', ABANDONED: 'red', REJECTED: 'red', EXPIRED: 'red', CANCELLED: 'red',
  SETTLEMENT_IN_PROGRESS: 'blue', PROCESSING: 'blue', REQUESTED: 'blue', PENDING: 'blue',
  AWAITING_SETTLEMENT: 'gold', PENDING_REVIEW: 'gold', CREATED: 'gold',
  REFUNDED: 'purple',
};

export function pill(state: string | null | undefined): string {
  if (!state) return '<span class="muted">—</span>';
  const tone = TONE[state];
  return `<span class="tag-pill${tone ? ` tag-pill--${tone}` : ''}">${esc(state)}</span>`;
}

// Reporting classification (never a financial state). Rendered with the
// existing status-badge treatment.
export const TEST_MODE_MARKER = 'TEST_MODE_NON_GENUINE_SETTLEMENT';
export const TEST_MODE_LABEL = 'Test-mode — non-genuine';
export const NOT_CLASSIFIED_LABEL = 'Not classified';

export function classificationBadge(value: string | null | undefined): string {
  return value === TEST_MODE_MARKER ? `<span class="tag-pill tag-pill--red">${TEST_MODE_LABEL}</span>` : '';
}

// Display-only review flags (financial-admin-metrics.ts REVIEW_FLAGS).
export const REVIEW_FLAG_LABELS: Record<string, string> = {
  RECEIPT_STATE_UNEXPECTED: 'Receipt on unexpected state',
  RECEIPT_AMOUNT_MISMATCH: 'Receipt amount mismatch',
  REFUND_STATE_MISMATCH: 'Refund / state mismatch',
  REFUND_EXCEEDS_CONTRIBUTION: 'Refund exceeds contribution',
  MULTIPLE_SUCCEEDED_TRANSACTIONS: 'Multiple succeeded transactions',
};

export function reviewFlagsCell(flags: string[]): string {
  if (!flags.length) return '<span class="muted">—</span>';
  return flags.map((f) => `<span class="tag-pill tag-pill--gold" title="${esc(f)}">${esc(REVIEW_FLAG_LABELS[f] ?? f)}</span>`).join(' ');
}

export function label(key: string): string {
  return key.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export interface Contributor {
  name: string | null;
  username: string | null;
  membershipNumber?: string | null;
}

export function contributorCell(c: Contributor): string {
  const name = esc(c.name ?? '—');
  const sub = [c.username ? `@${esc(c.username)}` : '', c.membershipNumber ? `<span class="mono">${esc(c.membershipNumber)}</span>` : '']
    .filter(Boolean)
    .join(' · ');
  return `${name}${sub ? `<div class="cell-sub">${sub}</div>` : ''}`;
}

export function receiptCell(receipt: { receiptNumber: string } | null): string {
  return receipt ? `<span class="mono">${esc(receipt.receiptNumber)}</span>` : `<span class="muted">${NO_RECEIPT_LABEL}</span>`;
}

export interface ContributionItem {
  reference: string;
  businessModule: string;
  purpose: string;
  state: string;
  amountPaise: number;
  currency: string;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  contributor: Contributor;
  receipt: { receiptNumber: string; issuedAt: string | null } | null;
  refundStatus: string | null;
  latestTransaction: { provider: string | null; outcome: string } | null;
  evidenceStatus: string | null;
  settlementClassification: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function contributionsTable(items: ContributionItem[]): string {
  if (!items.length) return '<div class="state-empty">No contributions match.</div>';
  const rows = items
    .map(
      (c) => `
      <tr>
        <td><a class="mono ref-link" href="${DETAIL_HREF}?ref=${encodeURIComponent(c.reference)}">${esc(c.reference.slice(0, 8))}…</a></td>
        <td>${contributorCell(c.contributor)}</td>
        <td><span class="tag-pill">${esc(c.businessModule)}</span><div class="cell-sub">${esc(c.purpose)}</div></td>
        <td class="mono num">${esc(money(c.amountPaise, c.currency))}</td>
        <td>${pill(c.state)}${c.settlementClassification ? `<div class="cell-sub">${classificationBadge(c.settlementClassification)}</div>` : ''}</td>
        <td>${c.latestTransaction ? `${esc(c.latestTransaction.provider ?? '—')} ${pill(c.latestTransaction.outcome)}` : '<span class="muted">—</span>'}</td>
        <td>${receiptCell(c.receipt)}</td>
        <td>${c.refundStatus ? pill(c.refundStatus) : '<span class="muted">—</span>'}</td>
        <td class="mono">${esc(dateTime(c.createdAt))}</td>
      </tr>`,
    )
    .join('');
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Reference</th><th>Contributor</th><th>Module</th><th>Amount</th><th>State</th>
          <th>Latest transaction</th><th>Receipt</th><th>Refund</th><th>Created</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Renders "Showing x–y of N" with Previous/Next; onPage receives the new page.
export function renderPager(el: HTMLElement, page: Page<unknown>, onPage: (p: number) => void): void {
  const from = page.total === 0 ? 0 : (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.total, page.page * page.pageSize);
  const last = Math.max(1, Math.ceil(page.total / page.pageSize));
  el.innerHTML = `
    <span class="pager__info">Showing ${from}–${to} of ${page.total}</span>
    <button type="button" class="btn-action" data-pg="prev" ${page.page <= 1 ? 'disabled' : ''}>Previous</button>
    <button type="button" class="btn-action" data-pg="next" ${page.page >= last ? 'disabled' : ''}>Next</button>`;
  el.querySelector('[data-pg="prev"]')?.addEventListener('click', () => onPage(page.page - 1));
  el.querySelector('[data-pg="next"]')?.addEventListener('click', () => onPage(page.page + 1));
}

export function showError(el: HTMLElement, err: unknown): void {
  el.hidden = false;
  el.className = 'state-error';
  el.textContent = err instanceof Error ? err.message : 'Could not load financial records.';
}
