// backend/src/modules/events/events.pay001.spec.ts
//
// Module 04 x PAY-001 integration (EVENT-ARCH-001 §7). Behavioural tests of
// EventsService against a small in-memory stand-in for the Kysely `db`
// (events / event_registrations / users rows) and an in-memory stand-in for
// FinancialContributionService that enforces the real PAY-001 transition
// rules the Events code depends on. PAY-001 itself is not modified or
// re-tested here -- its own suites cover it.

jest.mock('kysely', () => ({ sql: () => ({}) }));

// ── In-memory db ────────────────────────────────────────────────────────────
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
let nextId = 1;
const col = (c: unknown) => (typeof c === 'string' ? c.split('.').pop()! : c);

function matches(row: Row, filters: Array<[string, string, any]>) {
  return filters.every(([c, op, v]) => {
    const x = row[c];
    switch (op) {
      case '=':
        return x === v;
      case '!=':
        return x !== v;
      case 'in':
        return (v as any[]).includes(x);
      case 'not in':
        return !(v as any[]).includes(x);
      case 'is not':
        return x !== v;
      default:
        throw new Error(`op ${op}`);
    }
  });
}

function selectQuery(table: string) {
  const filters: Array<[string, string, any]> = [];
  let countAlias: string | null = null;
  let order: [string, string] | null = null;
  let limitN: number | null = null;
  const run = () => {
    let rows = (tables[table] ?? []).filter((r) => matches(r, filters));
    if (countAlias) return [{ [countAlias]: rows.length }];
    if (order) {
      const [c, dir] = order;
      rows = [...rows].sort(
        (a, b) => (a[c] > b[c] ? 1 : -1) * (dir === 'desc' ? -1 : 1),
      );
    }
    if (limitN !== null) rows = rows.slice(0, limitN);
    return rows.map((r) => ({ ...r }));
  };
  const q: any = {
    select: (arg: any) => {
      if (typeof arg === 'function') {
        const eb = {
          fn: { countAll: () => ({ as: (a: string) => ({ __count: a }) }) },
        };
        const out = arg(eb);
        const c = (Array.isArray(out) ? out : [out]).find(
          (o: any) => o && o.__count,
        );
        if (c) countAlias = c.__count;
      }
      return q;
    },
    selectAll: () => q,
    leftJoin: () => q,
    groupBy: () => q,
    forUpdate: () => q,
    offset: () => q,
    where: (c: string, op: string, v: any) => {
      filters.push([col(c) as string, op, v]);
      return q;
    },
    orderBy: (c: any, dir = 'asc') => {
      if (typeof c === 'string') order = [col(c) as string, dir];
      return q;
    },
    limit: (n: number) => {
      limitN = n;
      return q;
    },
    execute: async () => run(),
    executeTakeFirst: async () => run()[0],
    executeTakeFirstOrThrow: async () => {
      const r = run()[0];
      if (!r) throw new Error(`no row in ${table}`);
      return r;
    },
  };
  return q;
}

const fakeDb: any = {
  selectFrom: (t: string) => selectQuery(t.split(' ')[0]),
  insertInto: (t: string) => ({
    values: (v: Row) => {
      const insert = async () => {
        const id = nextId++;
        (tables[t] ??= []).push({ id, ...v });
        return { insertId: BigInt(id) };
      };
      return { execute: insert, executeTakeFirstOrThrow: insert };
    },
  }),
  updateTable: (t: string) => {
    let patch: Row = {};
    const filters: Array<[string, string, any]> = [];
    const u: any = {
      set: (p: Row) => {
        patch = p;
        return u;
      },
      where: (c: string, op: string, v: any) => {
        filters.push([col(c) as string, op, v]);
        return u;
      },
      execute: async () => {
        for (const r of tables[t] ?? [])
          if (matches(r, filters)) Object.assign(r, patch);
      },
    };
    return u;
  },
  transaction: () => ({ execute: (fn: (trx: any) => any) => fn(fakeDb) }),
};
jest.mock('../../database/db', () => ({ db: fakeDb }));
jest.mock('../shared/storage/imagekit.util', () => ({ ikUrl: () => null }));
jest.mock('../shared/communication/communication.service', () => ({
  CommunicationService: class {},
}));

import { BadRequestException, ConflictException } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsFinancialListener } from './financial/events-financial.listener';
import { FinancialEventBus } from '../financial/financial-event-bus.service';
import { FINANCIAL_EVENT_TYPES } from '../financial/financial.events';
import {
  ALLOWED_TRANSITIONS,
  CANCELLABLE_CONTRIBUTION_STATES,
} from '../financial/financial.types';
import {
  EVENT_REGISTRATION_BUSINESS_MODULE,
  eventRegistrationContributionKey,
} from './events.types';

// ── In-memory PAY-001 stand-in (real transition table) ───────────────────────
function makeFinancial() {
  const byId = new Map<number, Row>();
  let cid = 1000;
  const get = (id: number) => {
    const c = byId.get(id);
    if (!c) throw new Error(`contribution ${id} missing`);
    return c;
  };
  const move = (id: number, to: string) => {
    const c = get(id);
    if (!(ALLOWED_TRANSITIONS as any)[c.state].includes(to)) {
      throw new ConflictException(
        `transition ${c.state} -> ${to} not permitted`,
      );
    }
    c.state = to;
  };
  const f = {
    byId,
    findByIdempotencyKey: jest.fn(async (key: string) =>
      [...byId.values()].find((c) => c.idempotency_key === key),
    ),
    createContribution: jest.fn(async (o: any) => {
      const existing = [...byId.values()].find(
        (c) => c.idempotency_key === o.idempotencyKey,
      );
      if (existing) return { id: existing.id, uuid: 'u' };
      const id = cid++;
      byId.set(id, {
        id,
        state: 'CREATED',
        amount_paise: o.amountPaise,
        currency: 'INR',
        business_module: o.businessModule,
        business_reference_id: o.businessReferenceId,
        idempotency_key: o.idempotencyKey,
        payer_user_id: o.payerUserId,
      });
      return { id, uuid: 'u' };
    }),
    getContribution: jest.fn(async (id: number) => ({ ...get(id) })),
    transitionContribution: jest.fn(async (id: number, to: string) => {
      move(id, to);
      return null;
    }),
    processZeroValueContribution: jest.fn(async (id: number) => {
      const c = get(id);
      if (c.amount_paise !== 0) throw new ConflictException('not zero');
      if (c.state === 'CREATED') move(id, 'AWAITING_SETTLEMENT');
      move(id, 'SETTLED');
      move(id, 'COMPLETED');
    }),
    cancelContribution: jest.fn(async (id: number) => {
      const c = get(id);
      if (
        !(CANCELLABLE_CONTRIBUTION_STATES as readonly string[]).includes(
          c.state,
        )
      ) {
        throw new ConflictException('not cancellable');
      }
      c.state = 'CANCELLED';
    }),
    requestRefund: jest.fn(async (id: number) => {
      const c = get(id);
      if (c.state !== 'COMPLETED')
        throw new ConflictException('not refundable');
      if (c.refunded)
        return { refundId: 1, status: 'REQUESTED', alreadyRequested: true };
      c.refunded = true;
      return { refundId: 1, status: 'REQUESTED', alreadyRequested: false };
    }),
  };
  return f;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
let comm: { dispatch: jest.Mock };
let fin: ReturnType<typeof makeFinancial>;
let svc: EventsService;

function seedEvent(over: Row = {}): number {
  const id = nextId++;
  (tables.events ??= []).push({
    id,
    title: 'Dawn Walk',
    slug: 'dawn-walk',
    state: 'PUBLISHED',
    is_historical: 0,
    fee_type: 'FREE',
    base_fee_paise: 0,
    capacity: null,
    waitlist_enabled: 1,
    eligibility_mode: 'OPEN',
    allowed_class_ids: null,
    starts_at: '2026-10-10 06:00:00',
    location_name: 'Van Vihar',
    what_to_bring: null,
    ...over,
  });
  return id;
}
const paidEvent = (over: Row = {}) =>
  seedEvent({ fee_type: 'FLAT', base_fee_paise: 50000, ...over });
const regs = (eventId: number) =>
  (tables.event_registrations ?? []).filter((r) => r.event_id === eventId);
const reg = (id: number) =>
  tables.event_registrations.find((r) => r.id === id)!;
const contributionFor = (r: Row) =>
  [...fin.byId.values()].find(
    (c) =>
      c.idempotency_key ===
      eventRegistrationContributionKey(r.event_id, r.user_id, r.id),
  );
const dispatched = (key: string) =>
  comm.dispatch.mock.calls.filter((c) => c[0] === key);
const flush = () => new Promise((r) => setImmediate(r));
function seedReg(
  eventId: number,
  userId: number,
  status: string,
  extra: Row = {},
): number {
  const id = nextId++;
  (tables.event_registrations ??= []).push({
    id,
    uuid: `u${id}`,
    event_id: eventId,
    user_id: userId,
    registration_type: 'MEMBER',
    status,
    waitlist_position: null,
    registered_at: '2026-09-30 10:00:00',
    ...extra,
  });
  return id;
}
async function completePayment(regId: number) {
  const c = contributionFor(reg(regId))!;
  c.state = 'COMPLETED'; // what PAY-001's webhook path produces
  await svc.handleContributionCompleted({
    eventType: FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED,
    contributionId: c.id,
    businessModule: EVENT_REGISTRATION_BUSINESS_MODULE,
    businessReferenceId: regId,
    amountPaise: c.amount_paise,
    currency: 'INR',
    contributionState: 'COMPLETED',
    occurredAt: new Date(),
  });
  return c;
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.users = [7, 8, 9, 99].map((id) => ({ id, full_name: `User ${id}` }));
  comm = { dispatch: jest.fn(async () => undefined) };
  fin = makeFinancial();
  svc = new EventsService(comm as any, fin as any);
});

// ── FREE ────────────────────────────────────────────────────────────────────
describe('FREE Activity registration', () => {
  it('REGISTERED row gets a zero-value PAY-001 Contribution that completes', async () => {
    const ev = seedEvent();
    const res = await svc.registerForEvent(ev, 7);
    expect(res.status).toBe('REGISTERED');
    expect(res.payment).toBeNull();
    expect(fin.createContribution).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaise: 0,
        businessModule: 'EVENT_REGISTRATION',
        businessReferenceId: res.id,
        idempotencyKey: `EVENT-${ev}-USER-7-REG-${res.id}`,
        purpose: 'Activity registration',
      }),
    );
    expect(fin.processZeroValueContribution).toHaveBeenCalled();
    expect(contributionFor(reg(res.id))!.state).toBe('COMPLETED');
    expect(fin.transitionContribution).not.toHaveBeenCalledWith(
      expect.anything(),
      'AWAITING_SETTLEMENT',
    );
    expect(dispatched('EVENT_REGISTRATION_CONFIRMED')).toHaveLength(1);
  });

  it('a WAITLISTED FREE row also gets a zero-value Contribution', async () => {
    const ev = seedEvent({ capacity: 1 });
    seedReg(ev, 8, 'REGISTERED');
    const res = await svc.registerForEvent(ev, 7);
    expect(res.status).toBe('WAITLISTED');
    expect(contributionFor(reg(res.id))).toMatchObject({
      amount_paise: 0,
      state: 'COMPLETED',
    });
  });

  it('a zero-value Contribution failure does not roll back the FREE registration', async () => {
    const ev = seedEvent();
    fin.createContribution.mockRejectedValueOnce(new Error('db down'));
    const res = await svc.registerForEvent(ev, 7);
    expect(res.status).toBe('REGISTERED');
    expect(reg(res.id).status).toBe('REGISTERED');
  });

  it('never writes the legacy fee_paid_paise column', async () => {
    const res = await svc.registerForEvent(seedEvent(), 7);
    expect(reg(res.id)).not.toHaveProperty('fee_paid_paise');
  });
});

// ── FLAT ────────────────────────────────────────────────────────────────────
describe('FLAT Activity registration', () => {
  it('available seat -> PENDING_PAYMENT with a payable Contribution and no confirmation', async () => {
    const ev = paidEvent();
    const res = await svc.registerForEvent(ev, 7);
    expect(res.status).toBe('PENDING_PAYMENT');
    const c = contributionFor(reg(res.id))!;
    expect(c).toMatchObject({
      amount_paise: 50000,
      state: 'AWAITING_SETTLEMENT',
      business_module: 'EVENT_REGISTRATION',
    });
    expect(fin.createContribution).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'Activity registration: Dawn Walk' }),
    );
    expect(res.payment).toEqual({
      financial_contribution_id: c.id,
      amount_paise: 50000,
      currency: 'INR',
    });
    expect(res.resumed).toBe(false);
    expect(comm.dispatch).not.toHaveBeenCalled();
  });

  it('full + waitlist -> WAITLISTED and no Contribution', async () => {
    const ev = paidEvent({ capacity: 1 });
    seedReg(ev, 8, 'PENDING_PAYMENT');
    const res = await svc.registerForEvent(ev, 7);
    expect(res.status).toBe('WAITLISTED');
    expect(fin.createContribution).not.toHaveBeenCalled();
  });

  it('full + no waitlist -> 409 and nothing created', async () => {
    const ev = paidEvent({ capacity: 1, waitlist_enabled: 0 });
    seedReg(ev, 8, 'REGISTERED');
    await expect(svc.registerForEvent(ev, 7)).rejects.toThrow(
      ConflictException,
    );
    expect(regs(ev)).toHaveLength(1);
    expect(fin.createContribution).not.toHaveBeenCalled();
  });

  it('historical Activity is rejected before any financial call', async () => {
    const ev = seedEvent({ is_historical: 1, state: 'COMPLETED' });
    await expect(svc.registerForEvent(ev, 7)).rejects.toThrow(
      BadRequestException,
    );
    expect(fin.createContribution).not.toHaveBeenCalled();
    expect(fin.findByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('an already-REGISTERED user still gets 409', async () => {
    const ev = paidEvent();
    seedReg(ev, 7, 'REGISTERED');
    await expect(svc.registerForEvent(ev, 7)).rejects.toThrow(
      ConflictException,
    );
  });
});

// ── Resume ──────────────────────────────────────────────────────────────────
describe('idempotent resume of PENDING_PAYMENT', () => {
  it('returns the same registration and Contribution, never a second one', async () => {
    const ev = paidEvent();
    const first = await svc.registerForEvent(ev, 7);
    const second = await svc.registerForEvent(ev, 7);
    expect(second.id).toBe(first.id);
    expect(second.resumed).toBe(true);
    expect(second.payment!.financial_contribution_id).toBe(
      first.payment!.financial_contribution_id,
    );
    expect(regs(ev)).toHaveLength(1);
    expect(fin.byId.size).toBe(1);
    expect(fin.createContribution).toHaveBeenCalledTimes(1);
    expect(fin.findByIdempotencyKey).toHaveBeenLastCalledWith(
      `EVENT-${ev}-USER-7-REG-${first.id}`,
    );
  });

  it('repairs a Contribution left in CREATED', async () => {
    const ev = paidEvent();
    fin.transitionContribution.mockRejectedValueOnce(new Error('crash'));
    await expect(svc.registerForEvent(ev, 7)).rejects.toThrow('crash');
    const r = regs(ev)[0];
    expect(contributionFor(r)!.state).toBe('CREATED');
    const res = await svc.registerForEvent(ev, 7);
    expect(res.id).toBe(r.id);
    expect(contributionFor(r)!.state).toBe('AWAITING_SETTLEMENT');
  });

  it('creates the missing Contribution when the first attempt failed before it', async () => {
    const ev = paidEvent();
    fin.createContribution.mockRejectedValueOnce(new Error('crash'));
    await expect(svc.registerForEvent(ev, 7)).rejects.toThrow('crash');
    const res = await svc.registerForEvent(ev, 7);
    expect(res.payment).not.toBeNull();
    expect(fin.byId.size).toBe(1);
  });

  it('self-heals to REGISTERED when PAY-001 already reports COMPLETED', async () => {
    const ev = paidEvent();
    const first = await svc.registerForEvent(ev, 7);
    fin.byId.get(first.payment!.financial_contribution_id)!.state = 'COMPLETED'; // lost event
    const res = await svc.registerForEvent(ev, 7);
    expect(res.status).toBe('REGISTERED');
    expect(res.payment).toBeNull();
    expect(dispatched('EVENT_REGISTRATION_CONFIRMED')).toHaveLength(1);
    await svc.registerForEvent(ev, 7).catch(() => undefined); // now a normal duplicate
    expect(dispatched('EVENT_REGISTRATION_CONFIRMED')).toHaveLength(1);
  });

  it('a new registration after CANCELLED is a new attempt with a new key', async () => {
    const ev = paidEvent();
    const first = await svc.registerForEvent(ev, 7);
    await svc.cancelRegistration(ev, first.id, 7, {}, false);
    const second = await svc.registerForEvent(ev, 7);
    expect(second.id).not.toBe(first.id);
    expect(second.payment!.financial_contribution_id).not.toBe(
      first.payment!.financial_contribution_id,
    );
  });
});

// ── Completion handler / listener ───────────────────────────────────────────
describe('CONTRIBUTION_COMPLETED handling', () => {
  it('PENDING_PAYMENT -> REGISTERED with exactly one confirmation, idempotent on redelivery', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    await completePayment(r.id);
    await completePayment(r.id);
    expect(reg(r.id)).toMatchObject({
      status: 'REGISTERED',
      waitlist_position: null,
    });
    expect(dispatched('EVENT_REGISTRATION_CONFIRMED')).toHaveLength(1);
    expect(fin.requestRefund).not.toHaveBeenCalled();
  });

  it('ignores other business modules', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    await svc.handleContributionCompleted({
      eventType: 'x',
      contributionId: 1,
      businessModule: 'MERCHANDISE_ORDER',
      businessReferenceId: r.id,
      amountPaise: 50000,
      currency: 'INR',
      contributionState: 'COMPLETED',
      occurredAt: new Date(),
    });
    expect(reg(r.id).status).toBe('PENDING_PAYMENT');
  });

  it('cancelled registration -> automatic SYSTEM refund, once', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    const c = contributionFor(reg(r.id))!;
    c.state = 'SETTLEMENT_IN_PROGRESS'; // user mid-checkout
    await svc.cancelRegistration(ev, r.id, 7, {}, false);
    expect(fin.requestRefund).not.toHaveBeenCalled();
    await completePayment(r.id);
    await completePayment(r.id);
    expect(fin.requestRefund).toHaveBeenCalledWith(c.id, expect.any(String), {
      actorType: 'SYSTEM',
      actorUserId: null,
    });
    expect(c.refunded).toBe(true);
    expect(reg(r.id).status).toBe('CANCELLED');
    expect(dispatched('EVENT_REGISTRATION_CONFIRMED')).toHaveLength(0);
  });

  it('cancelled Activity -> automatic SYSTEM refund, registration not confirmed', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    contributionFor(reg(r.id))!.state = 'SETTLEMENT_IN_PROGRESS';
    await svc.cancelEvent(ev, 'rain', 99);
    await completePayment(r.id);
    expect(fin.requestRefund).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(String),
      { actorType: 'SYSTEM', actorUserId: null },
    );
    expect(reg(r.id).status).toBe('PENDING_PAYMENT');
    expect(dispatched('EVENT_REGISTRATION_CONFIRMED')).toHaveLength(0);
  });

  it('zero-value completion is a no-op', async () => {
    const ev = seedEvent();
    const r = await svc.registerForEvent(ev, 7);
    comm.dispatch.mockClear();
    await svc.handleContributionCompleted({
      eventType: 'x',
      contributionId: 1,
      businessModule: EVENT_REGISTRATION_BUSINESS_MODULE,
      businessReferenceId: r.id,
      amountPaise: 0,
      currency: 'INR',
      contributionState: 'COMPLETED',
      occurredAt: new Date(),
    });
    expect(comm.dispatch).not.toHaveBeenCalled();
    expect(fin.requestRefund).not.toHaveBeenCalled();
  });

  it('listener subscribes to CONTRIBUTION_COMPLETED on the existing bus and filters by module', async () => {
    const bus = new FinancialEventBus();
    const events = {
      handleContributionCompleted: jest.fn(async () => undefined),
    };
    new EventsFinancialListener(bus, events as any).onModuleInit();
    const base = {
      contributionId: 1,
      businessReferenceId: 2,
      amountPaise: 5,
      currency: 'INR',
      contributionState: 'COMPLETED' as const,
      occurredAt: new Date(),
    };
    bus.emit(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED, {
      ...base,
      eventType: 'c',
      businessModule: 'MEMBERSHIP',
    });
    bus.emit(FINANCIAL_EVENT_TYPES.SETTLEMENT_FAILED, {
      ...base,
      eventType: 'f',
      businessModule: EVENT_REGISTRATION_BUSINESS_MODULE,
    });
    bus.emit(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED, {
      ...base,
      eventType: 'c',
      businessModule: EVENT_REGISTRATION_BUSINESS_MODULE,
    });
    await flush();
    expect(events.handleContributionCompleted).toHaveBeenCalledTimes(1);
  });

  it('listener swallows handler errors (never crashes the bus)', async () => {
    const bus = new FinancialEventBus();
    const events = {
      handleContributionCompleted: jest.fn(async () => {
        throw new Error('boom');
      }),
    };
    new EventsFinancialListener(bus, events as any).onModuleInit();
    expect(() =>
      bus.emit(FINANCIAL_EVENT_TYPES.CONTRIBUTION_COMPLETED, {
        eventType: 'c',
        contributionId: 1,
        businessModule: EVENT_REGISTRATION_BUSINESS_MODULE,
        businessReferenceId: 2,
        amountPaise: 5,
        currency: 'INR',
        contributionState: 'COMPLETED',
        occurredAt: new Date(),
      }),
    ).not.toThrow();
    await flush();
  });
});

// ── Payment failure ─────────────────────────────────────────────────────────
describe('payment failure / abandonment', () => {
  it('a FAILED Contribution leaves the registration PENDING_PAYMENT and resumable on the same Contribution', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    const c = contributionFor(reg(r.id))!;
    c.state = 'FAILED';
    const res = await svc.registerForEvent(ev, 7);
    expect(res.status).toBe('PENDING_PAYMENT');
    expect(res.payment!.financial_contribution_id).toBe(c.id);
    expect(fin.byId.size).toBe(1);
  });
});

// ── Cancellation ────────────────────────────────────────────────────────────
describe('registration cancellation', () => {
  it('AWAITING_SETTLEMENT -> cancelContribution BEFORE the registration flips', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    let statusAtCancel: string | undefined;
    fin.cancelContribution.mockImplementationOnce(async (id: number) => {
      statusAtCancel = reg(r.id).status;
      fin.byId.get(id)!.state = 'CANCELLED';
    });
    await svc.cancelRegistration(ev, r.id, 7, {}, false);
    expect(statusAtCancel).toBe('PENDING_PAYMENT');
    expect(reg(r.id).status).toBe('CANCELLED');
    expect(contributionFor(reg(r.id))!.state).toBe('CANCELLED');
  });

  it('SETTLEMENT_IN_PROGRESS -> cancelled without any local financial mutation', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    contributionFor(reg(r.id))!.state = 'SETTLEMENT_IN_PROGRESS';
    await svc.cancelRegistration(ev, r.id, 7, {}, false);
    expect(fin.cancelContribution).not.toHaveBeenCalled();
    expect(fin.transitionContribution).toHaveBeenCalledTimes(1); // only the original AWAITING_SETTLEMENT
    expect(fin.requestRefund).not.toHaveBeenCalled();
    expect(reg(r.id).status).toBe('CANCELLED');
  });

  it.each(['FAILED', 'ABANDONED'])(
    '%s -> no financial transition attempted',
    async (state) => {
      const ev = paidEvent();
      const r = await svc.registerForEvent(ev, 7);
      contributionFor(reg(r.id))!.state = state;
      await svc.cancelRegistration(ev, r.id, 7, {}, false);
      expect(fin.cancelContribution).not.toHaveBeenCalled();
      expect(fin.requestRefund).not.toHaveBeenCalled();
      expect(contributionFor(reg(r.id))!.state).toBe(state);
      expect(reg(r.id).status).toBe('CANCELLED');
    },
  );

  it('paid self-cancellation (D2) -> requestRefund with the HUMAN user actor', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    const c = await completePayment(r.id);
    await svc.cancelRegistration(
      ev,
      r.id,
      7,
      { reason: 'cannot attend' },
      false,
    );
    expect(fin.requestRefund).toHaveBeenCalledWith(
      c.id,
      expect.stringContaining('cannot attend'),
      { actorType: 'HUMAN', actorUserId: 7 },
    );
    expect(reg(r.id).status).toBe('CANCELLED');
  });

  it('coordinator cancellation refunds with the coordinator as HUMAN actor', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    await completePayment(r.id);
    await svc.cancelRegistration(ev, r.id, 99, {}, true);
    expect(fin.requestRefund).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(String),
      { actorType: 'HUMAN', actorUserId: 99 },
    );
  });

  it('a refund error never leaves the registration active', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    await completePayment(r.id);
    fin.requestRefund.mockRejectedValue(new Error('provider down'));
    await svc.cancelRegistration(ev, r.id, 7, {}, false);
    expect(reg(r.id).status).toBe('CANCELLED');
  });

  it('cancelling a seat-holding registration promotes the waitlist', async () => {
    const ev = seedEvent({ capacity: 1 });
    const a = await svc.registerForEvent(ev, 7);
    const b = await svc.registerForEvent(ev, 8);
    expect(b.status).toBe('WAITLISTED');
    await svc.cancelRegistration(ev, a.id, 7, {}, false);
    expect(reg(b.id)).toMatchObject({
      status: 'REGISTERED',
      waitlist_position: null,
    });
    expect(dispatched('EVENT_SLOT_AVAILABLE')).toHaveLength(1);
  });
});

// ── Activity cancellation ───────────────────────────────────────────────────
describe('Activity cancellation', () => {
  it('refunds COMPLETED, cancels unpaid, leaves in-flight/failed, notifies PENDING_PAYMENT', async () => {
    const ev = paidEvent();
    const paid = await svc.registerForEvent(ev, 7);
    const paidC = await completePayment(paid.id);
    const unpaid = await svc.registerForEvent(ev, 8);
    const inflight = await svc.registerForEvent(ev, 9);
    contributionFor(reg(inflight.id))!.state = 'SETTLEMENT_IN_PROGRESS';
    comm.dispatch.mockClear();

    await svc.cancelEvent(ev, 'rain', 99);

    expect(fin.requestRefund).toHaveBeenCalledTimes(1);
    expect(fin.requestRefund).toHaveBeenCalledWith(
      paidC.id,
      expect.any(String),
      { actorType: 'HUMAN', actorUserId: 99 },
    );
    expect(contributionFor(reg(unpaid.id))!.state).toBe('CANCELLED');
    expect(contributionFor(reg(inflight.id))!.state).toBe(
      'SETTLEMENT_IN_PROGRESS',
    );
    expect(dispatched('EVENT_CANCELLED')).toHaveLength(3);
    expect(reg(unpaid.id).status).toBe('PENDING_PAYMENT'); // rows untouched
  });
});

// ── Waitlist ────────────────────────────────────────────────────────────────
describe('waitlist promotion', () => {
  it('FLAT promotion -> PENDING_PAYMENT + AWAITING_SETTLEMENT Contribution, never REGISTERED', async () => {
    const ev = paidEvent({ capacity: 1 });
    const a = await svc.registerForEvent(ev, 7);
    const b = await svc.registerForEvent(ev, 8);
    expect(b.status).toBe('WAITLISTED');
    expect(fin.createContribution).toHaveBeenCalledTimes(1);
    comm.dispatch.mockClear();

    await svc.cancelRegistration(ev, a.id, 7, {}, false);

    expect(reg(b.id)).toMatchObject({
      status: 'PENDING_PAYMENT',
      waitlist_position: null,
    });
    expect(contributionFor(reg(b.id))).toMatchObject({
      amount_paise: 50000,
      state: 'AWAITING_SETTLEMENT',
    });
    expect(dispatched('EVENT_REGISTRATION_CONFIRMED')).toHaveLength(0);
    expect(dispatched('EVENT_SLOT_AVAILABLE')).toHaveLength(0); // its copy says "confirmed"
    await completePayment(b.id);
    expect(reg(b.id).status).toBe('REGISTERED');
  });

  it('FREE promotion is unchanged (REGISTERED + EVENT_SLOT_AVAILABLE)', async () => {
    const ev = seedEvent({ capacity: 1 });
    const a = await svc.registerForEvent(ev, 7);
    const b = await svc.registerForEvent(ev, 8);
    await svc.cancelRegistration(ev, a.id, 7, {}, false);
    expect(reg(b.id).status).toBe('REGISTERED');
    expect(dispatched('EVENT_SLOT_AVAILABLE')).toHaveLength(1);
  });

  it('PENDING_PAYMENT consumes capacity', async () => {
    const ev = paidEvent({ capacity: 1 });
    const a = await svc.registerForEvent(ev, 7);
    expect(a.status).toBe('PENDING_PAYMENT');
    const b = await svc.registerForEvent(ev, 8);
    expect(b.status).toBe('WAITLISTED');
  });
});

// ── Guards ──────────────────────────────────────────────────────────────────
describe('guards', () => {
  it('check-in rejects PENDING_PAYMENT', async () => {
    const ev = paidEvent();
    const r = await svc.registerForEvent(ev, 7);
    await expect(svc.checkIn(ev, r.id, 99)).rejects.toThrow(
      BadRequestException,
    );
    expect(reg(r.id).status).toBe('PENDING_PAYMENT');
  });

  it.each([
    ['FLAT amount change', { base_fee_paise: 60000 }],
    ['FLAT -> FREE', { fee_type: 'FREE', base_fee_paise: 0 }],
  ])('blocks %s while registrations exist', async (_label, dto) => {
    const ev = paidEvent();
    await svc.registerForEvent(ev, 7);
    await expect(svc.updateEvent(ev, dto as any, 99)).rejects.toThrow(
      BadRequestException,
    );
    expect(tables.events.find((e) => e.id === ev)!.base_fee_paise).toBe(50000);
  });

  it('blocks FREE -> FLAT while registrations exist', async () => {
    const ev = seedEvent();
    await svc.registerForEvent(ev, 7);
    await expect(
      svc.updateEvent(
        ev,
        { fee_type: 'FLAT', base_fee_paise: 50000 } as any,
        99,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows fee changes when only CANCELLED registrations exist', async () => {
    const ev = paidEvent();
    seedReg(ev, 7, 'CANCELLED');
    jest.spyOn(svc, 'getEvent').mockResolvedValue({} as any);
    await expect(
      svc.updateEvent(ev, { base_fee_paise: 60000 } as any, 99),
    ).resolves.toBeDefined();
    expect(tables.events.find((e) => e.id === ev)!.base_fee_paise).toBe(60000);
  });
});

// ── Module wiring ───────────────────────────────────────────────────────────
describe('EventsModule wiring', () => {
  it('imports FinancialModule and registers EventsFinancialListener', () => {
    // Heavy sibling modules are stubbed; only the @Module metadata is inspected.
    jest.isolateModules(() => {
      jest.doMock('../identity/auth/auth.module', () => ({
        AuthModule: class AuthModule {},
      }));
      jest.doMock('../identity/rbac/rbac.module', () => ({
        RbacModule: class RbacModule {},
      }));
      jest.doMock('../shared/communication/communication.module', () => ({
        CommunicationModule: class CommunicationModule {},
      }));
      jest.doMock('../financial/financial.module', () => ({
        FinancialModule: class FinancialModule {},
      }));
      const { EventsModule } = require('./events.module');
      const { FinancialModule } = require('../financial/financial.module');
      const {
        EventsFinancialListener: Listener,
      } = require('./financial/events-financial.listener');
      expect(Reflect.getMetadata('imports', EventsModule)).toContain(
        FinancialModule,
      );
      expect(Reflect.getMetadata('providers', EventsModule)).toContain(
        Listener,
      );
    });
  });
});
