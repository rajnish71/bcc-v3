// backend/src/modules/membership/groups/family-corporate-lifecycle.spec.ts
//
// Family & Corporate membership -- complete frozen lifecycle, behavioural.
//
//   APPLICATION -> PENDING -> CONTRIBUTION -> PAYMENT LINK -> PAYMENT
//   -> APPROVAL -> INVITE -> ACCEPT -> MEMBER RECORD -> ACTIVATE -> NUMBER
//
// Everything below runs the REAL services: MembershipLifecycleService,
// GroupMembershipService, GroupService, ApplicationWorkflowService,
// MembershipNumberingService, EntitlementService, FinancialContributionService,
// FinancialAuditService, RazorpayWebhookService, FinancialEventBus and
// MembershipFinancialListener. Only the edges are stubbed: the Razorpay
// provider (network), CommunicationService (email) and R2.
//
// The database is the recording FakeDb (test-support/fake-db.ts) backed by a
// small in-memory table model: selects/updates honour simple where clauses
// (=, !=, in, is, is not), inserts get auto-increment ids, and every
// db.transaction() restores the model on throw -- so a refused operation is
// proven to leave nothing behind. Row locks are not simulated (see the
// numbering section for how concurrency is covered).

jest.mock('../../../database/db', () => {
  const { FakeDb } = jest.requireActual('../../../test-support/fake-db');
  return { db: new FakeDb() };
});
jest.mock('../../shared/storage/r2.service', () => ({ R2Service: class {} }));
jest.mock('../../shared/communication/communication.service', () => ({ CommunicationService: class {} }));

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '../../../database/db';
import type { FakeDb, FakeOp } from '../../../test-support/fake-db';
import { FinancialContributionService } from '../../financial/financial-contribution.service';
import { FinancialAuditService } from '../../financial/audit/financial-audit.service';
import { FinancialEventBus } from '../../financial/financial-event-bus.service';
import { RazorpayWebhookService } from '../../financial/razorpay-webhook.service';
import type { SettlementProvider } from '../../financial/settlement-provider.interface';
import type { CommunicationService } from '../../shared/communication/communication.service';
import type { R2Service } from '../../shared/storage/r2.service';
import { ApplicationWorkflowService } from '../application/application-workflow.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { MembershipFinancialListener } from '../financial/membership-financial.listener';
import { MembershipLifecycleService } from '../lifecycle/membership-lifecycle.service';
import { MembershipNumberingService } from '../numbering/membership-numbering.service';
import { GroupMembershipService } from './group-membership.service';
import { GroupService } from './group.service';

const fake = db as unknown as FakeDb;
const WEBHOOK_SECRET = 'whsec_lifecycle_test';
const ORIGINAL_ENV = process.env;

// ── Actors ────────────────────────────────────────────────────────────────
const ADMIN = 900;
const FAMILY_HEAD = 100;
const CORP_HEAD = 150;
const OUTSIDER = 300;              // registered user, unrelated to any group
const ALREADY_MEMBER = 107;        // holds an ACTIVE individual membership
const FAMILY_ENTITY = 10;
const CORP_ENTITY = 11;
const FAMILY_TYPE = 1;
const CORP_TYPE = 2;
const FIRST_SERIAL = 53;

// ── In-memory table model ─────────────────────────────────────────────────

type Row = Record<string, any>;
type Store = Record<string, Row[]>;
let store: Store;
let nextIds: Record<string, number>;

function nowStr(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function seed(): void {
  const users: Row[] = [
    { id: ADMIN, email: 'admin@bcc.test', username: 'admin', full_name: 'Admin' },
    { id: FAMILY_HEAD, email: 'head@bcc.test', username: 'familyhead', full_name: 'Family Head' },
    { id: CORP_HEAD, email: 'hr@acme.test', username: 'acmehr', full_name: 'Acme HR' },
    { id: OUTSIDER, email: 'outsider@bcc.test', username: 'outsider', full_name: 'Outsider' },
    { id: ALREADY_MEMBER, email: 'member@bcc.test', username: 'existing', full_name: 'Existing Member' },
  ];
  for (let i = 101; i <= 106; i++) users.push({ id: i, email: `f${i}@bcc.test`, username: `family${i}`, full_name: `Family ${i}` });
  for (let i = 151; i <= 157; i++) users.push({ id: i, email: `c${i}@acme.test`, username: `corp${i}`, full_name: `Corp ${i}` });

  store = {
    users,
    group_membership_types: [
      { id: FAMILY_TYPE, code: 'FAMILY_MEMBERSHIP', name: 'Family Membership', entity_type: 'FAMILY', is_renewable: 1 },
      { id: CORP_TYPE, code: 'CORPORATE_MEMBERSHIP', name: 'Corporate Membership', entity_type: 'CORPORATE', is_renewable: 1 },
    ],
    // MEM-008 configuration (0087) -- the services must read these, never
    // hard-code them. required_document_types is the Corporate verification
    // requirement expressed as configuration.
    group_type_entitlements: [
      { group_membership_type_id: FAMILY_TYPE, entitlement_key: 'fee_inr', entitlement_value: '6000' },
      { group_membership_type_id: FAMILY_TYPE, entitlement_key: 'max_delegates', entitlement_value: '4' },
      { group_membership_type_id: FAMILY_TYPE, entitlement_key: 'renewal_term_months', entitlement_value: '24' },
      { group_membership_type_id: FAMILY_TYPE, entitlement_key: 'grace_period_days', entitlement_value: '60' },
      { group_membership_type_id: CORP_TYPE, entitlement_key: 'fee_inr', entitlement_value: '5000' },
      { group_membership_type_id: CORP_TYPE, entitlement_key: 'max_delegates', entitlement_value: '5' },
      { group_membership_type_id: CORP_TYPE, entitlement_key: 'renewal_term_months', entitlement_value: '12' },
      { group_membership_type_id: CORP_TYPE, entitlement_key: 'grace_period_days', entitlement_value: '30' },
      { group_membership_type_id: CORP_TYPE, entitlement_key: 'required_document_types', entitlement_value: 'COMPANY_REGISTRATION' },
    ],
    group_entities: [
      { id: FAMILY_ENTITY, type: 'FAMILY', name: 'Khare Family', primary_contact_user_id: FAMILY_HEAD },
      { id: CORP_ENTITY, type: 'CORPORATE', name: 'Acme Pvt Ltd', primary_contact_user_id: CORP_HEAD },
    ],
    // createGroup() inserts the head's own PRIMARY_CONTACT roster row.
    group_delegates: [
      { id: 1, group_entity_id: FAMILY_ENTITY, user_id: FAMILY_HEAD, role: 'PRIMARY_CONTACT', status: null, removed_at: null },
      { id: 2, group_entity_id: CORP_ENTITY, user_id: CORP_HEAD, role: 'PRIMARY_CONTACT', status: null, removed_at: null },
    ],
    memberships: [
      {
        id: 1, uuid: 'm-1', owner_type: 'INDIVIDUAL', user_id: ALREADY_MEMBER, group_entity_id: null,
        membership_class_id: 7, group_membership_type_id: null, parent_membership_id: null,
        lifecycle_state: 'ACTIVE', number_serial: 40, membership_number: 'BCC20240100040', expires_at: null,
      },
    ],
    membership_number_pool: [{ id: 1, next_operational_serial: FIRST_SERIAL }],
    membership_number_log: [],
    membership_audit_log: [],
    membership_application_documents: [],
    membership_approval_stages: [],
    financial_contributions: [],
    financial_transactions: [],
    financial_refunds: [],
    receipts: [],
    financial_event_outbox: [],
    financial_audit_log: [],
    settlement_webhook_inbox: [],
  };
  nextIds = { memberships: 1000, group_delegates: 50, financial_contributions: 700 };
}

function col(name: unknown): string {
  const s = String(name);
  return s.includes('.') ? s.slice(s.lastIndexOf('.') + 1) : s;
}

function matches(row: Row, op: FakeOp): boolean {
  return op.wheres.every(([c, o, v]) => {
    if (typeof c !== 'string') return true; // expression-builder callbacks: not modelled
    const actual = row[col(c)];
    const same = (a: unknown, b: unknown) => (a == null && b == null) || String(a) === String(b);
    switch (o) {
      case '=': return same(actual, v);
      case '!=': return !same(actual, v);
      case 'in': return (v as unknown[]).some((x) => same(actual, x));
      case 'is': return v === null ? actual == null : same(actual, v);
      case 'is not': return v === null ? actual != null : !same(actual, v);
      case '<': return actual != null && actual < (v as any);
      default: return true;
    }
  });
}

const DEFAULTS: Record<string, Row> = {
  memberships: {
    number_serial: null, membership_number: null, parent_membership_id: null, expires_at: null,
    activated_at: null, approved_at: null, last_payment_status: 'NONE', pending_contribution_id: null,
  },
  group_delegates: { role: 'DELEGATE', status: null, removed_at: null, member_membership_id: null },
  financial_contributions: { state: 'CREATED', active_settlement_reference: null, active_settlement_url: null },
  settlement_webhook_inbox: { status: 'RECEIVED', contribution_id: null },
  membership_application_documents: {},
};

function installModel(): void {
  fake.responder = (op: FakeOp) => {
    const rows = (store[op.table] ??= []);
    if (op.kind === 'select') return rows.filter((r) => matches(r, op)).map((r) => ({ ...r }));
    if (op.kind === 'insert') {
      const id = (nextIds[op.table] = (nextIds[op.table] ?? 5000) + 1);
      rows.push({ ...(DEFAULTS[op.table] ?? {}), created_at: nowStr(), id, ...op.values });
      return { insertId: BigInt(id) };
    }
    if (op.kind === 'update') {
      const hit = rows.filter((r) => matches(r, op));
      hit.forEach((r) => Object.assign(r, op.set));
      return { numUpdatedRows: BigInt(hit.length) };
    }
    return undefined;
  };
  // Transactions really roll back: restore the table model on throw.
  const original = Object.getPrototypeOf(fake).transaction.bind(fake);
  (fake as any).transaction = () => {
    const tx = original();
    return {
      execute: async <T>(cb: (trx: unknown) => Promise<T>): Promise<T> => {
        const snapshot = structuredClone(store);
        const ids = { ...nextIds };
        try {
          return await tx.execute(cb);
        } catch (err) {
          store = snapshot;
          nextIds = ids;
          throw err;
        }
      },
    };
  };
}

const table = (name: string) => store[name];
const membership = (id: number) => table('memberships').find((m) => m.id === id)!;
const pool = () => table('membership_number_pool')[0].next_operational_serial as number;
const auditEvents = (membershipId: number) =>
  table('membership_audit_log').filter((a) => a.membership_id === membershipId).map((a) => a.event_type);
const contributionFor = (key: string) => table('financial_contributions').find((c) => c.idempotency_key === key);

// ── Service graph ─────────────────────────────────────────────────────────

let provider: jest.Mocked<Required<SettlementProvider>>;
let financial: FinancialContributionService;
let webhook: RazorpayWebhookService;
let lifecycle: MembershipLifecycleService;
let groupMemberships: GroupMembershipService;
let groups: GroupService;
let workflow: ApplicationWorkflowService;
let linkSeq = 0;
let eventSeq = 0;

function buildServices(): void {
  provider = {
    providerName: 'RAZORPAY',
    createOrder: jest.fn(),
    refund: jest.fn().mockResolvedValue({ providerRefundReference: 'rfnd_1', status: 'COMPLETED' }),
    createPaymentLink: jest.fn().mockImplementation(async (input) => ({
      providerLinkReference: `plink_${++linkSeq}`,
      hostedUrl: `https://rzp.io/i/${linkSeq}`,
      amountPaise: input.amountPaise,
      currency: input.currency,
    })),
    cancelPaymentLink: jest.fn(),
    getPublicKeyId: jest.fn(),
    fetchOrder: jest.fn(),
    fetchPayment: jest.fn(),
  } as unknown as jest.Mocked<Required<SettlementProvider>>;

  const bus = new FinancialEventBus();
  financial = new FinancialContributionService(bus, provider, new FinancialAuditService());
  webhook = new RazorpayWebhookService(financial);
  const entitlements = new EntitlementService();
  const communication = { dispatch: jest.fn().mockResolvedValue(undefined) } as unknown as CommunicationService;
  lifecycle = new MembershipLifecycleService(new MembershipNumberingService(), communication, entitlements, financial);
  groupMemberships = new GroupMembershipService(lifecycle, entitlements);
  groups = new GroupService(entitlements);
  workflow = new ApplicationWorkflowService(lifecycle, {} as R2Service, communication);
  // Payment -> Membership only through Financial Engine events (PAY-001 §11).
  new MembershipFinancialListener(bus, lifecycle).onModuleInit();
}

// The listener's handlers are fire-and-forget; let them settle.
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
}

// ── Lifecycle steps ──────────────────────────────────────────────────────

async function applyGroup(entityId: number, typeId: number): Promise<number> {
  const { id } = await lifecycle.apply({ ownerType: 'GROUP', groupEntityId: entityId, groupMembershipTypeId: typeId });
  return id;
}

function applicationContribution(groupId: number) {
  return contributionFor(`MEMBERSHIP-${groupId}-CONTRIBUTION`)!;
}

async function deliver(event: Record<string, unknown>): Promise<void> {
  const rawBody = Buffer.from(JSON.stringify(event), 'utf8');
  await webhook.handle({
    rawBody,
    signature: createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex'),
    eventId: `evt_${++eventSeq}`,
  });
  await flush();
}

async function payContribution(contributionId: number): Promise<string> {
  const link = await financial.initiateProviderPaymentLink(contributionId);
  const c = table('financial_contributions').find((x) => x.id === contributionId)!;
  await deliver({
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: link.providerLinkReference, amount: c.amount_paise, currency: 'INR', status: 'paid' } },
      payment: { entity: { id: `pay_${eventSeq + 1}`, order_id: 'order_x', amount: c.amount_paise, currency: 'INR' } },
    },
  });
  return link.providerLinkReference;
}

async function approveViaWorkflow(groupId: number) {
  return workflow.recordStageDecision({ membershipId: groupId, stage: 'COORDINATOR', decision: 'APPROVED', actorUserId: ADMIN });
}

async function paidApprovedFamily(): Promise<number> {
  const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
  await payContribution(applicationContribution(groupId).id);
  await approveViaWorkflow(groupId);
  return groupId;
}

async function inviteAndAccept(groupId: number, head: number, identifier: string): Promise<number> {
  const { invitationId } = await groupMemberships.invite(groupId, identifier, head);
  const invitee = table('users').find((u) => u.email === identifier || u.username === identifier)!;
  const { memberMembershipId } = await groupMemberships.accept(invitationId, invitee.id);
  return memberMembershipId;
}

beforeEach(() => {
  fake.reset();
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET };
  linkSeq = 0;
  eventSeq = 0;
  seed();
  installModel();
  buildServices();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// ═══════════════════════════════════════════════════════════════════════════
// FAMILY
// ═══════════════════════════════════════════════════════════════════════════

describe('Family — application & contribution', () => {
  it('application: group PENDING, ₹6,000 (600000 paise INR) Contribution from configuration, AWAITING_SETTLEMENT, no number', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);

    expect(membership(groupId)).toMatchObject({ owner_type: 'GROUP', lifecycle_state: 'PENDING', number_serial: null, membership_number: null });
    expect(applicationContribution(groupId)).toMatchObject({
      business_module: 'MEMBERSHIP', business_reference_id: groupId, payer_user_id: FAMILY_HEAD,
      purpose: 'Family Membership fee', amount_paise: 600000, currency: 'INR', state: 'AWAITING_SETTLEMENT',
    });
    expect(pool()).toBe(FIRST_SERIAL);
  });

  it('the amount follows configuration, not code', async () => {
    table('group_type_entitlements').find((e) => e.group_membership_type_id === FAMILY_TYPE && e.entitlement_key === 'fee_inr')!.entitlement_value = '7000';
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    expect(applicationContribution(groupId).amount_paise).toBe(700000);
  });

  it('a missing fee configuration refuses the application and writes nothing', async () => {
    store.group_type_entitlements = table('group_type_entitlements').filter((e) => !(e.group_membership_type_id === FAMILY_TYPE && e.entitlement_key === 'fee_inr'));
    await expect(applyGroup(FAMILY_ENTITY, FAMILY_TYPE)).rejects.toThrow(/no valid fee_inr/);
    expect(table('memberships').filter((m) => m.owner_type === 'GROUP')).toHaveLength(0);
    expect(table('financial_contributions')).toHaveLength(0);
  });

  it('Payment Link is created for the Contribution amount (no client amount exists anywhere)', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    const link = await financial.initiateProviderPaymentLink(applicationContribution(groupId).id);
    expect(link).toMatchObject({ amountPaise: 600000, currency: 'INR', hostedUrl: 'https://rzp.io/i/1' });
    expect(provider.createPaymentLink.mock.calls[0][0]).toMatchObject({ amountPaise: 600000, currency: 'INR' });
  });
});

describe('Family — payment before approval', () => {
  it('approval is blocked before payment; nothing is persisted by the refused attempt', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await expect(approveViaWorkflow(groupId)).rejects.toThrow(/approval requires COMPLETED/);
    expect(membership(groupId).lifecycle_state).toBe('PENDING');
    expect(table('membership_approval_stages')).toHaveLength(0);
  });

  it('payment success settles the Contribution; the membership stays PENDING with no number', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await payContribution(applicationContribution(groupId).id);

    expect(applicationContribution(groupId).state).toBe('COMPLETED');
    expect(table('receipts')).toHaveLength(1);
    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'PENDING', number_serial: null });
    expect(auditEvents(groupId)).toContain('PAYMENT_RECEIVED');
    expect(pool()).toBe(FIRST_SERIAL);
  });

  it('an expired link leaves the Contribution retryable and the membership PENDING', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    const c = applicationContribution(groupId);
    const link = await financial.initiateProviderPaymentLink(c.id);
    await deliver({
      event: 'payment_link.expired',
      payload: { payment_link: { entity: { id: link.providerLinkReference, amount: 600000, currency: 'INR' } } },
    });
    expect(applicationContribution(groupId).state).toBe('ABANDONED');
    expect(membership(groupId).lifecycle_state).toBe('PENDING');

    await financial.retrySettlement(c.id);
    const second = await financial.initiateProviderPaymentLink(c.id);
    expect(second.providerLinkReference).toBe('plink_2');
    expect(table('financial_contributions')).toHaveLength(1);
  });

  it('a failed payment attempt leaves the membership PENDING, unapprovable and unactivatable', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await financial.initiateProviderPaymentLink(applicationContribution(groupId).id);
    await deliver({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_f', order_id: 'order_of_link', amount: 600000, currency: 'INR' } } },
    });
    expect(membership(groupId).lifecycle_state).toBe('PENDING');
    await expect(approveViaWorkflow(groupId)).rejects.toThrow(/approval requires COMPLETED/);
    await expect(lifecycle.activate(groupId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow(ConflictException);
    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'PENDING', number_serial: null });
  });

  it('approval succeeds after payment: PENDING -> APPROVED, still no number and no member record', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await payContribution(applicationContribution(groupId).id);

    await expect(approveViaWorkflow(groupId)).resolves.toMatchObject({ applicationState: 'APPROVED' });

    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'APPROVED', number_serial: null });
    expect(table('memberships').filter((m) => m.parent_membership_id === groupId)).toHaveLength(0);
    expect(pool()).toBe(FIRST_SERIAL);
  });
});

describe('Family — invitation, acceptance, capacity', () => {
  it('invitations are impossible before approval', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await payContribution(applicationContribution(groupId).id);
    await expect(groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD)).rejects.toThrow(/only after the group membership is approved/);
  });

  it('the head invites (email or username); the seat is INVITED and nothing else happens', async () => {
    const groupId = await paidApprovedFamily();
    const res = await groupMemberships.invite(groupId, 'family101', FAMILY_HEAD);

    expect(res).toMatchObject({ status: 'INVITED', capacity: { max: 4, used: 1, remaining: 3 } });
    const seat = table('group_delegates').find((d) => d.id === res.invitationId)!;
    expect(seat).toMatchObject({ user_id: 101, status: 'INVITED', group_membership_id: groupId, invited_by_user_id: FAMILY_HEAD, member_membership_id: null });
    expect(table('memberships').filter((m) => m.parent_membership_id === groupId)).toHaveLength(0);
    expect(auditEvents(groupId)).toContain('GROUP_MEMBER_INVITED');
  });

  it('acceptance creates the member OWN record: APPROVED, parent-linked, group type, no class, NO number', async () => {
    const groupId = await paidApprovedFamily();
    const memberId = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');

    expect(membership(memberId)).toMatchObject({
      owner_type: 'INDIVIDUAL', user_id: 101, membership_class_id: null, group_membership_type_id: FAMILY_TYPE,
      parent_membership_id: groupId, lifecycle_state: 'APPROVED', number_serial: null, membership_number: null,
    });
    expect(table('group_delegates').find((d) => d.user_id === 101)).toMatchObject({ status: 'ACCEPTED', member_membership_id: memberId });
    expect(auditEvents(groupId)).toContain('GROUP_MEMBER_INVITATION_ACCEPTED');
    expect(auditEvents(memberId)).toContain('GROUP_MEMBER_ASSIGNED');
    expect(pool()).toBe(FIRST_SERIAL);
  });

  it('the head can take a seat for themselves (own record, own number later) -- no group number', async () => {
    const groupId = await paidApprovedFamily();
    const headRecord = await inviteAndAccept(groupId, FAMILY_HEAD, 'head@bcc.test');
    expect(membership(headRecord)).toMatchObject({ user_id: FAMILY_HEAD, parent_membership_id: groupId });
    // Same single roster row (unique per entity+user) reused for the seat.
    expect(table('group_delegates').filter((d) => d.user_id === FAMILY_HEAD)).toHaveLength(1);
  });

  it('capacity = 4 from configuration: the fifth invitation is refused (invited seats count)', async () => {
    const groupId = await paidApprovedFamily();
    for (const u of ['head@bcc.test', 'f101@bcc.test', 'f102@bcc.test', 'f103@bcc.test']) {
      await groupMemberships.invite(groupId, u, FAMILY_HEAD);
    }
    await expect(groupMemberships.invite(groupId, 'f104@bcc.test', FAMILY_HEAD)).rejects.toThrow(/member limit \(4\)/);
    expect(table('group_delegates').filter((d) => d.status === 'INVITED')).toHaveLength(4);
  });

  it('a duplicate invitation and an already-member invitee are refused (no duplicate records)', async () => {
    const groupId = await paidApprovedFamily();
    await groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD);
    await expect(groupMemberships.invite(groupId, 'family101', FAMILY_HEAD)).rejects.toThrow(/already invited/);
    await expect(groupMemberships.invite(groupId, 'member@bcc.test', FAMILY_HEAD)).rejects.toThrow(/already holds an open membership/);
  });

  it('an unregistered invitee is refused (members are Registered Users)', async () => {
    const groupId = await paidApprovedFamily();
    await expect(groupMemberships.invite(groupId, 'nobody@nowhere.test', FAMILY_HEAD)).rejects.toThrow(NotFoundException);
  });
});

describe('Family — activation & numbering (MEM-007)', () => {
  it('payment → approval → invitation → acceptance allocate NO number; activation allocates the next sequential one', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    expect(pool()).toBe(FIRST_SERIAL);
    await payContribution(applicationContribution(groupId).id);
    expect(pool()).toBe(FIRST_SERIAL);
    await approveViaWorkflow(groupId);
    expect(pool()).toBe(FIRST_SERIAL);
    const { invitationId } = await groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD);
    expect(pool()).toBe(FIRST_SERIAL);
    const { memberMembershipId } = await groupMemberships.accept(invitationId, 101);
    expect(pool()).toBe(FIRST_SERIAL);
    expect(table('membership_number_log')).toHaveLength(0);

    const result = await lifecycle.activate(memberMembershipId, { type: 'ADMIN', userId: ADMIN });

    expect(membership(memberMembershipId)).toMatchObject({ lifecycle_state: 'ACTIVE', number_serial: FIRST_SERIAL });
    expect(result.membershipNumber).toBe(membership(memberMembershipId).membership_number);
    expect(result.membershipNumber).toMatch(new RegExp(`^BCC\\d{6}${String(FIRST_SERIAL).padStart(5, '0')}$`));
    expect(pool()).toBe(FIRST_SERIAL + 1);
  });

  it('first member activation activates the group relationship UNNUMBERED; all members share its 24-month term', async () => {
    const groupId = await paidApprovedFamily();
    const a = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    const b = await inviteAndAccept(groupId, FAMILY_HEAD, 'f102@bcc.test');

    await lifecycle.activate(a, { type: 'ADMIN', userId: ADMIN });
    await lifecycle.activate(b, { type: 'ADMIN', userId: ADMIN });

    const group = membership(groupId);
    expect(group).toMatchObject({ lifecycle_state: 'ACTIVE', number_serial: null, membership_number: null });
    const months = (new Date(group.expires_at).getFullYear() - new Date().getFullYear()) * 12 +
      (new Date(group.expires_at).getMonth() - new Date().getMonth());
    expect(months).toBe(24);
    expect(membership(a).expires_at).toBe(group.expires_at);
    expect(membership(b).expires_at).toBe(group.expires_at);
    // Sequential, one number per record, from the single unified pool.
    expect([membership(a).number_serial, membership(b).number_serial]).toEqual([FIRST_SERIAL, FIRST_SERIAL + 1]);
    expect(table('membership_number_log').map((l) => l.assignment_type)).toEqual(['OPERATIONAL_SEQUENTIAL', 'OPERATIONAL_SEQUENTIAL']);
  });

  // Human Authority ruling 2: the ONLY Group activation trigger is the first
  // successful individual member activation.
  it('a GROUP cannot be activated directly (even approved + paid); it stays APPROVED and unnumbered', async () => {
    const groupId = await paidApprovedFamily();
    await expect(lifecycle.activate(groupId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow(/first member is activated/);
    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'APPROVED', number_serial: null, activated_at: null });
    expect(pool()).toBe(FIRST_SERIAL);
  });

  it('first member activation is atomic with Group activation: a numbering failure rolls BOTH back', async () => {
    const groupId = await paidApprovedFamily();
    const memberId = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    store.membership_number_pool = []; // allocator cannot read the pool -> numbering step throws

    await expect(lifecycle.activate(memberId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow();

    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'APPROVED', activated_at: null, expires_at: null });
    expect(membership(memberId)).toMatchObject({ lifecycle_state: 'APPROVED', number_serial: null });
    expect(table('membership_number_log')).toHaveLength(0);
  });

  it('subsequent activations neither restart nor extend the Group term, and leave the Group unnumbered', async () => {
    const groupId = await paidApprovedFamily();
    const a = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    await lifecycle.activate(a, { type: 'ADMIN', userId: ADMIN });
    const termAfterFirst = { activated_at: membership(groupId).activated_at, expires_at: membership(groupId).expires_at };

    // Late-added member: invited and accepted AFTER the Group is already ACTIVE.
    const late = await inviteAndAccept(groupId, FAMILY_HEAD, 'f102@bcc.test');
    await lifecycle.activate(late, { type: 'ADMIN', userId: ADMIN });

    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'ACTIVE', number_serial: null, membership_number: null, ...termAfterFirst });
    expect(membership(late)).toMatchObject({ lifecycle_state: 'ACTIVE', number_serial: FIRST_SERIAL + 1, expires_at: termAfterFirst.expires_at });
    expect(membership(a).expires_at).toBe(termAfterFirst.expires_at);
  });

  it('activation cannot bypass approval: a PENDING (paid or unpaid) group cannot be activated', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await expect(lifecycle.activate(groupId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow(ConflictException);
    await payContribution(applicationContribution(groupId).id);
    await expect(lifecycle.activate(groupId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow(ConflictException);
    expect(pool()).toBe(FIRST_SERIAL);
  });

  it('activation cannot bypass payment: a member of an unpaid group is refused and no number is drawn', async () => {
    const groupId = await paidApprovedFamily();
    const memberId = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    applicationContribution(groupId).state = 'REFUNDED'; // payment no longer standing
    await expect(lifecycle.activate(memberId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow(/activation requires COMPLETED/);
    expect(membership(memberId).number_serial).toBeNull();
    expect(pool()).toBe(FIRST_SERIAL);
  });

  it('numbers are never reused and nothing is skipped because of revoked invitations', async () => {
    const groupId = await paidApprovedFamily();
    const a = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    await lifecycle.activate(a, { type: 'ADMIN', userId: ADMIN });                      // 53
    await groupMemberships.invite(groupId, 'f102@bcc.test', FAMILY_HEAD);
    await groupMemberships.revokeMember(groupId, 102, ADMIN, 'Invited in error');     // never accepted: no number
    await groupMemberships.revokeMember(groupId, 101, ADMIN, 'Left the household');    // active: keeps 53
    const c = await inviteAndAccept(groupId, FAMILY_HEAD, 'f103@bcc.test');
    await lifecycle.activate(c, { type: 'ADMIN', userId: ADMIN });                      // 54 -- not 53

    expect(membership(a)).toMatchObject({ lifecycle_state: 'TERMINATED', number_serial: FIRST_SERIAL });
    expect(membership(c).number_serial).toBe(FIRST_SERIAL + 1);
    const serials = table('memberships').map((m) => m.number_serial).filter((s) => s != null);
    expect(new Set(serials).size).toBe(serials.length);
  });

  it('numbering allocation is row-locked and serial-unique (concurrency guarantee is structural)', () => {
    const numberingSrc = readFileSync(join(__dirname, '../numbering/membership-numbering.service.ts'), 'utf8');
    expect(numberingSrc).toMatch(/selectFrom\('membership_number_pool'\)[\s\S]*?\.forUpdate\(\)/);
    expect(numberingSrc).toMatch(/where\('number_serial', 'is', null\)/);
    const createMemberships = readFileSync(join(__dirname, '../../../../../database/migrations/0004_create_memberships.sql'), 'utf8');
    expect(createMemberships).toMatch(/number_serial\s+INT NULL UNIQUE/);
  });
});

describe('Family — creator cannot revoke; administration can', () => {
  it('the head has no way to remove, replace or transfer an assigned member', async () => {
    const groupId = await paidApprovedFamily();
    await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');

    await expect(groups.removeDelegate(FAMILY_ENTITY, 101, FAMILY_HEAD, false)).rejects.toThrow(ForbiddenException);
    await expect(groups.addDelegate(FAMILY_ENTITY, 102, FAMILY_HEAD, false)).rejects.toThrow(/join by invitation/);
    await expect(groups.updateGroup(FAMILY_ENTITY, { primaryContactUserId: 101 }, FAMILY_HEAD, false)).rejects.toThrow(ForbiddenException);
    expect(table('group_delegates').find((d) => d.user_id === 101)).toMatchObject({ status: 'ACCEPTED', removed_at: null });
  });

  it('even staff cannot use the roster-only delete on a seat -- only the audited revocation', async () => {
    const groupId = await paidApprovedFamily();
    await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    await expect(groups.removeDelegate(FAMILY_ENTITY, 101, ADMIN, true)).rejects.toThrow(/administrative member revocation/);
  });

  it('admin revocation: seat REVOKED_BY_ADMIN with actor+reason, member TERMINATED, number retained, capacity freed', async () => {
    const groupId = await paidApprovedFamily();
    for (const u of ['head@bcc.test', 'f101@bcc.test', 'f102@bcc.test']) await inviteAndAccept(groupId, FAMILY_HEAD, u);
    const d = await inviteAndAccept(groupId, FAMILY_HEAD, 'f103@bcc.test');
    await lifecycle.activate(d, { type: 'ADMIN', userId: ADMIN });
    const number = membership(d).membership_number;
    await expect(groupMemberships.invite(groupId, 'f104@bcc.test', FAMILY_HEAD)).rejects.toThrow(/member limit/);

    const res = await groupMemberships.revokeMember(groupId, 103, ADMIN, 'Requested by the family');

    expect(res).toMatchObject({ status: 'REVOKED_BY_ADMIN', memberMembershipId: d, memberLifecycleState: 'TERMINATED' });
    expect(table('group_delegates').find((x) => x.user_id === 103)).toMatchObject({
      status: 'REVOKED_BY_ADMIN', revoked_by_user_id: ADMIN, revocation_reason: 'Requested by the family',
    });
    expect(membership(d)).toMatchObject({ lifecycle_state: 'TERMINATED', membership_number: number });
    const revokeAudit = table('membership_audit_log').find((a) => a.event_type === 'GROUP_MEMBER_REVOKED')!;
    expect(revokeAudit).toMatchObject({ membership_id: groupId, actor_type: 'ADMIN', actor_user_id: ADMIN, notes: 'Requested by the family' });
    expect(JSON.parse(revokeAudit.new_value)).toMatchObject({ targetUserId: 103, memberMembershipId: d });
    // Seat freed through the lifecycle; a new invitation now fits.
    await expect(groupMemberships.invite(groupId, 'f104@bcc.test', FAMILY_HEAD)).resolves.toMatchObject({ status: 'INVITED' });
  });

  it('revocation requires a reason', async () => {
    const groupId = await paidApprovedFamily();
    await groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD);
    await expect(groupMemberships.revokeMember(groupId, 101, ADMIN, '  ')).rejects.toThrow(BadRequestException);
  });

  it('a revoked member can no longer be activated', async () => {
    const groupId = await paidApprovedFamily();
    const memberId = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    await groupMemberships.revokeMember(groupId, 101, ADMIN, 'Removed');
    await expect(lifecycle.activate(memberId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow(ConflictException);
    expect(membership(memberId).number_serial).toBeNull();
  });
});

describe('Family — renewal', () => {
  async function activeFamilyWithTwo() {
    const groupId = await paidApprovedFamily();
    const a = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    const b = await inviteAndAccept(groupId, FAMILY_HEAD, 'f102@bcc.test');
    await lifecycle.activate(a, { type: 'ADMIN', userId: ADMIN });
    await lifecycle.activate(b, { type: 'ADMIN', userId: ADMIN });
    return { groupId, a, b };
  }

  it('renewal is refused until the term renewal Contribution is COMPLETED', async () => {
    const { groupId } = await activeFamilyWithTwo();
    await expect(lifecycle.renewGroup(groupId, ADMIN)).rejects.toThrow(/renewal Financial Contribution is missing/);
    const renewal = await lifecycle.createGroupRenewalContribution(groupId);
    expect(renewal).toMatchObject({ amountPaise: 600000, currency: 'INR', state: 'AWAITING_SETTLEMENT' });
    await expect(lifecycle.renewGroup(groupId, ADMIN)).rejects.toThrow(/in state 'AWAITING_SETTLEMENT'/);
  });

  it('paid renewal extends the group and its members IN PLACE: no new records, no new numbers', async () => {
    const { groupId, a, b } = await activeFamilyWithTwo();
    const before = { records: table('memberships').length, pool: pool(), a: membership(a).membership_number, oldEnd: membership(groupId).expires_at };

    const renewal = await lifecycle.createGroupRenewalContribution(groupId);
    await payContribution(renewal.contributionId);
    expect(membership(groupId).lifecycle_state).toBe('ACTIVE'); // payment alone renews nothing
    expect(membership(groupId).expires_at).toBe(before.oldEnd);

    const res = await lifecycle.renewGroup(groupId, ADMIN);

    expect(res.renewedMemberIds.sort()).toEqual([a, b].sort());
    expect(new Date(membership(groupId).expires_at).getTime()).toBeGreaterThan(new Date(before.oldEnd).getTime());
    expect(membership(a).expires_at).toBe(membership(groupId).expires_at);
    expect(membership(a).membership_number).toBe(before.a);
    expect(table('memberships')).toHaveLength(before.records);
    expect(pool()).toBe(before.pool);
    expect(table('financial_contributions').filter((c) => c.business_reference_id === groupId)).toHaveLength(2);
  });

  it('the renewal obligation is idempotent per term', async () => {
    const { groupId } = await activeFamilyWithTwo();
    const first = await lifecycle.createGroupRenewalContribution(groupId);
    const again = await lifecycle.createGroupRenewalContribution(groupId);
    expect(again.contributionId).toBe(first.contributionId);
  });

  it('group-linked records cannot use the unpaid individual renewal path', async () => {
    const { groupId, a } = await activeFamilyWithTwo();
    membership(groupId).lifecycle_state = 'EXPIRED';
    membership(a).lifecycle_state = 'EXPIRED';
    await expect(lifecycle.renewFromExpired(groupId, ADMIN)).rejects.toThrow(/renew the group membership/);
    await expect(lifecycle.renewFromExpired(a, ADMIN)).rejects.toThrow(/renew the group membership/);
  });
});

describe('Family — rejection', () => {
  it('before payment: PENDING -> REJECTED, Contribution cancelled, no refund, no number', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await workflow.recordStageDecision({ membershipId: groupId, stage: 'COORDINATOR', decision: 'REJECTED', actorUserId: ADMIN, note: 'Incomplete' });

    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'REJECTED', number_serial: null });
    expect(applicationContribution(groupId).state).toBe('CANCELLED');
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('after payment: REJECTED + refund through the existing Financial Engine (auditable), never activatable', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await payContribution(applicationContribution(groupId).id);
    await workflow.recordStageDecision({ membershipId: groupId, stage: 'COORDINATOR', decision: 'REJECTED', actorUserId: ADMIN, note: 'Not eligible' });

    expect(membership(groupId)).toMatchObject({ lifecycle_state: 'REJECTED', number_serial: null });
    expect(provider.refund).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 600000 }));
    expect(table('financial_refunds')).toHaveLength(1);
    expect(applicationContribution(groupId).state).toBe('REFUNDED');
    expect(table('financial_audit_log').some((a) => a.event_type === 'REFUND_REQUESTED')).toBe(true);

    await expect(lifecycle.activate(groupId, { type: 'ADMIN', userId: ADMIN })).rejects.toThrow(ConflictException);
    await expect(groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD)).rejects.toThrow(ConflictException);
    expect(pool()).toBe(FIRST_SERIAL);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CORPORATE
// ═══════════════════════════════════════════════════════════════════════════

describe('Corporate', () => {
  async function paidCorporate(): Promise<number> {
    const groupId = await applyGroup(CORP_ENTITY, CORP_TYPE);
    await payContribution(applicationContribution(groupId).id);
    return groupId;
  }

  function addDocument(groupId: number, reviewStatus: 'PENDING_REVIEW' | 'ACCEPTED' | 'REJECTED') {
    table('membership_application_documents').push({
      id: 1, membership_id: groupId, document_type: 'COMPANY_REGISTRATION', upload_status: 'UPLOADED', review_status: reviewStatus,
    });
  }

  it('₹5,000 (500000 paise INR) Contribution from configuration', async () => {
    const groupId = await applyGroup(CORP_ENTITY, CORP_TYPE);
    expect(applicationContribution(groupId)).toMatchObject({
      amount_paise: 500000, currency: 'INR', payer_user_id: CORP_HEAD, purpose: 'Corporate Membership fee',
    });
  });

  it('verification requirement: paid but unverified -> approval refused; pending/rejected review does not count', async () => {
    const groupId = await paidCorporate();
    await expect(approveViaWorkflow(groupId)).rejects.toThrow(/verification is incomplete \(no accepted document for: COMPANY_REGISTRATION\)/);
    addDocument(groupId, 'PENDING_REVIEW');
    await expect(approveViaWorkflow(groupId)).rejects.toThrow(/verification is incomplete/);
    expect(membership(groupId).lifecycle_state).toBe('PENDING');
    expect(table('membership_approval_stages')).toHaveLength(0);
  });

  it('verified + paid -> approved', async () => {
    const groupId = await paidCorporate();
    addDocument(groupId, 'ACCEPTED');
    await expect(approveViaWorkflow(groupId)).resolves.toMatchObject({ applicationState: 'APPROVED' });
  });

  it('verified but unpaid -> still refused (payment is not optional)', async () => {
    const groupId = await applyGroup(CORP_ENTITY, CORP_TYPE);
    addDocument(groupId, 'ACCEPTED');
    await expect(approveViaWorkflow(groupId)).rejects.toThrow(/approval requires COMPLETED/);
  });

  it('capacity = 5: the sixth invitation is refused; activation numbers sequentially; 12-month term', async () => {
    const groupId = await paidCorporate();
    addDocument(groupId, 'ACCEPTED');
    await approveViaWorkflow(groupId);

    const ids: number[] = [];
    for (let u = 151; u <= 155; u++) ids.push(await inviteAndAccept(groupId, CORP_HEAD, `c${u}@acme.test`));
    await expect(groupMemberships.invite(groupId, 'c156@acme.test', CORP_HEAD)).rejects.toThrow(/member limit \(5\)/);

    for (const id of ids) await lifecycle.activate(id, { type: 'ADMIN', userId: ADMIN });
    expect(ids.map((id) => membership(id).number_serial)).toEqual([53, 54, 55, 56, 57]);
    expect(membership(groupId).number_serial).toBeNull();
    const end = new Date(membership(groupId).expires_at);
    expect((end.getFullYear() - new Date().getFullYear()) * 12 + end.getMonth() - new Date().getMonth()).toBe(12);
  });

  // Human Authority ruling 9: document requirements are configuration only.
  it('with NO document type configured, a paid Corporate application is approvable (no invented requirement)', async () => {
    store.group_type_entitlements = table('group_type_entitlements')
      .filter((e) => !(e.group_membership_type_id === CORP_TYPE && e.entitlement_key === 'required_document_types'));
    const groupId = await paidCorporate();
    await expect(approveViaWorkflow(groupId)).resolves.toMatchObject({ applicationState: 'APPROVED' });
  });

  it('whatever document type is configured is the one enforced; none is hard-coded', async () => {
    table('group_type_entitlements').find((e) => e.entitlement_key === 'required_document_types')!.entitlement_value = 'BOARD_RESOLUTION';
    const groupId = await paidCorporate();
    addDocument(groupId, 'ACCEPTED'); // a COMPANY_REGISTRATION document no longer satisfies it
    await expect(approveViaWorkflow(groupId)).rejects.toThrow(/no accepted document for: BOARD_RESOLUTION/);

    const src = readFileSync(join(__dirname, '../lifecycle/membership-lifecycle.service.ts'), 'utf8');
    expect(src).not.toMatch(/COMPANY_REGISTRATION|REGISTRATION_CERTIFICATE|BOARD_RESOLUTION/);
  });

  it('a Corporate head cannot revoke either', async () => {
    const groupId = await paidCorporate();
    addDocument(groupId, 'ACCEPTED');
    await approveViaWorkflow(groupId);
    await inviteAndAccept(groupId, CORP_HEAD, 'c151@acme.test');
    await expect(groups.removeDelegate(CORP_ENTITY, 151, CORP_HEAD, false)).rejects.toThrow(ForbiddenException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY
// ═══════════════════════════════════════════════════════════════════════════

describe('Security', () => {
  it('a non-member / unrelated member cannot invite into a group', async () => {
    const groupId = await paidApprovedFamily();
    const memberId = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    expect(memberId).toBeGreaterThan(0);
    await expect(groupMemberships.invite(groupId, 'f102@bcc.test', OUTSIDER)).rejects.toThrow(ForbiddenException);
    await expect(groupMemberships.invite(groupId, 'f102@bcc.test', 101)).rejects.toThrow(ForbiddenException); // an assigned member is not the head
    await expect(groupMemberships.invite(groupId, 'f102@bcc.test', CORP_HEAD)).rejects.toThrow(ForbiddenException); // another group's head
  });

  it('an invitation cannot be accepted for another person', async () => {
    const groupId = await paidApprovedFamily();
    const { invitationId } = await groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD);
    await expect(groupMemberships.accept(invitationId, FAMILY_HEAD)).rejects.toThrow(ForbiddenException);
    await expect(groupMemberships.accept(invitationId, OUTSIDER)).rejects.toThrow(ForbiddenException);
    expect(table('group_delegates').find((d) => d.id === invitationId)!.status).toBe('INVITED');
  });

  it('an invitation cannot be accepted twice, or after admin revocation', async () => {
    const groupId = await paidApprovedFamily();
    const { invitationId } = await groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD);
    await groupMemberships.accept(invitationId, 101);
    await expect(groupMemberships.accept(invitationId, 101)).rejects.toThrow(/no longer pending/);

    const second = await groupMemberships.invite(groupId, 'f102@bcc.test', FAMILY_HEAD);
    await groupMemberships.revokeMember(groupId, 102, ADMIN, 'Withdrawn');
    await expect(groupMemberships.accept(second.invitationId, 102)).rejects.toThrow(/no longer pending/);
    expect(table('memberships').filter((m) => m.user_id === 102)).toHaveLength(0);
  });

  it('acceptance re-checks capacity (configuration lowered after invitations)', async () => {
    const groupId = await paidApprovedFamily();
    const one = await groupMemberships.invite(groupId, 'f101@bcc.test', FAMILY_HEAD);
    const two = await groupMemberships.invite(groupId, 'f102@bcc.test', FAMILY_HEAD);
    table('group_type_entitlements').find((e) => e.group_membership_type_id === FAMILY_TYPE && e.entitlement_key === 'max_delegates')!.entitlement_value = '1';
    await groupMemberships.accept(one.invitationId, 101);
    await expect(groupMemberships.accept(two.invitationId, 102)).rejects.toThrow(/member limit \(1\)/);
    expect(table('memberships').filter((m) => m.user_id === 102)).toHaveLength(0);
  });

  it('the head can list members/capacity; an outsider cannot', async () => {
    const groupId = await paidApprovedFamily();
    await expect(groupMemberships.listMembers(groupId, OUTSIDER, false)).rejects.toThrow(ForbiddenException);
  });

  it('approval cannot bypass financial settlement (direct lifecycle call, not just the workflow)', async () => {
    const groupId = await applyGroup(FAMILY_ENTITY, FAMILY_TYPE);
    await expect(lifecycle.approve(groupId, ADMIN)).rejects.toThrow(/approval requires COMPLETED/);
    expect(membership(groupId).lifecycle_state).toBe('PENDING');
  });

  // Ruling 8: no invented Group transition when its last active member goes.
  it('revoking the last active member does not change the Group lifecycle', async () => {
    const groupId = await paidApprovedFamily();
    const only = await inviteAndAccept(groupId, FAMILY_HEAD, 'f101@bcc.test');
    await lifecycle.activate(only, { type: 'ADMIN', userId: ADMIN });
    const before = { ...membership(groupId) };

    await groupMemberships.revokeMember(groupId, 101, ADMIN, 'Left');

    expect(membership(only).lifecycle_state).toBe('TERMINATED');
    // The Group row is left exactly as it was: still ACTIVE, same term, unnumbered.
    expect(membership(groupId)).toEqual(before);
    expect(before).toMatchObject({ lifecycle_state: 'ACTIVE', number_serial: null });
  });

  it('INSTITUTIONAL has no lifecycle here (no fee configured -> no application)', async () => {
    store.group_membership_types.push({ id: 3, code: 'INSTITUTIONAL_MEMBERSHIP', name: 'Institutional Membership', entity_type: 'INSTITUTIONAL', is_renewable: 1 });
    store.group_entities.push({ id: 12, type: 'INSTITUTIONAL', name: 'College', primary_contact_user_id: OUTSIDER });
    await expect(applyGroup(12, 3)).rejects.toThrow(/no valid fee_inr/);
  });
});

describe('Security — route surface (real source inspection)', () => {
  const GROUP_CONTROLLER = readFileSync(join(__dirname, 'group.controller.ts'), 'utf8');
  const MEMBERSHIP_CONTROLLER = readFileSync(join(__dirname, '../membership.controller.ts'), 'utf8');
  const GROUP_MEMBERSHIP_SRC = readFileSync(join(__dirname, 'group-membership.service.ts'), 'utf8');
  const LIFECYCLE_SRC = readFileSync(join(__dirname, '../lifecycle/membership-lifecycle.service.ts'), 'utf8');

  it('the ONLY revoke route is admin-guarded (both existing permissions, AND semantics)', () => {
    const revokeRoutes = GROUP_CONTROLLER.match(/@Post\('[^']*revoke[^']*'\)/g) ?? [];
    expect(revokeRoutes).toEqual(["@Post('memberships/:groupMembershipId/members/:userId/revoke')"]);
    const decorators = GROUP_CONTROLLER.slice(
      GROUP_CONTROLLER.indexOf(String(revokeRoutes[0])),
      GROUP_CONTROLLER.indexOf('async revokeMember('),
    );
    expect(decorators).toContain('@UseGuards(RbacGuard)');
    expect(decorators).toContain("@RequirePermissions(MANAGE_ANY, 'membership.lifecycle.terminate')");
  });

  it('invite / accept / list routes take no amount, state, number or target user id from the client', () => {
    const dto = readFileSync(join(__dirname, '../dto/group-member.dto.ts'), 'utf8');
    expect(dto).not.toMatch(/amount|state|membershipNumber|serial|userId/i);
  });

  it('lifecycle mutations stay behind existing RBAC (the head cannot change a member status)', () => {
    for (const route of [':id/activate', ':id/suspend', ':id/terminate', ':id/group-renew']) {
      const block = MEMBERSHIP_CONTROLLER.slice(MEMBERSHIP_CONTROLLER.indexOf(`@Post('${route}')`));
      expect(block.slice(0, 300)).toMatch(/@RequirePermissions\('membership\.lifecycle\.[a-z_]+'\)/);
    }
  });

  it('numbering is reachable only from activate(): never from payment, approval, invitation or acceptance', () => {
    expect(GROUP_MEMBERSHIP_SRC).not.toMatch(/numberingService|assignPermanentNumber/);
    const calls = LIFECYCLE_SRC.match(/this\.numberingService\.assignPermanentNumber\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const activate = LIFECYCLE_SRC.slice(LIFECYCLE_SRC.indexOf('  async activate('), LIFECYCLE_SRC.indexOf('  async recordPaymentFailure('));
    expect(activate).toContain('this.numberingService.assignPermanentNumber(');
  });

  it('no Family/Corporate-specific numbering sequence or payment table was introduced', () => {
    const migration = readFileSync(join(__dirname, '../../../../../database/migrations/0105_group_member_records_and_invitations.sql'), 'utf8');
    const code = migration.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/CREATE TABLE/i);
    expect(code).not.toMatch(/number_pool|number_serial|membership_number/i);
  });
});
