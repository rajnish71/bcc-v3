// backend/src/test-support/fake-db.ts
//
// Minimal recording stand-in for the Kysely `db` export, used via
// jest.mock('<path>/database/db', ...) so services that import db.ts can be
// instantiated under this project's CommonJS Jest config (the real db.ts
// loads Kysely, which is ESM-only at runtime).
//
// Transaction semantics mirror what the audit-atomicity tests need: writes
// made through a transaction executor are only moved to `committed` if the
// callback resolves; if it throws, they move to `rolledBack` and the error
// propagates -- the same contract as Kysely's db.transaction().execute().

export type OpKind = 'insert' | 'update' | 'select' | 'delete';

export interface FakeOp {
  kind: OpKind;
  table: string;
  values?: Record<string, unknown>;
  set?: Record<string, unknown>;
  wheres: Array<[unknown, unknown, unknown]>;
  inTransaction: boolean;
  // Identifies which db.transaction() the op ran in (null = autocommit), so
  // tests can assert a business write and its audit row share one transaction.
  txId: number | null;
  result?: unknown;
}

export type Responder = (op: FakeOp) => unknown;

export class FakeDb {
  committed: FakeOp[] = [];
  rolledBack: FakeOp[] = [];
  selects: FakeOp[] = [];
  private nextId = 1000;
  private nextTxId = 1;
  responder: Responder = () => undefined;
  failWhen: (op: FakeOp) => Error | null = () => null;

  reset(): void {
    this.committed = [];
    this.rolledBack = [];
    this.selects = [];
    this.nextId = 1000;
    this.responder = () => undefined;
    this.failWhen = () => null;
  }

  // Direct (autocommit) executor surface.
  insertInto(table: string) { return this.builder('insert', table, null, null); }
  updateTable(table: string) { return this.builder('update', table, null, null); }
  selectFrom(table: string) { return this.builder('select', table, null, null); }
  deleteFrom(table: string) { return this.builder('delete', table, null, null); }

  transaction() {
    return {
      execute: async <T>(cb: (trx: unknown) => Promise<T>): Promise<T> => {
        const pending: FakeOp[] = [];
        const txId = this.nextTxId++;
        const trx = {
          insertInto: (t: string) => this.builder('insert', t, pending, txId),
          updateTable: (t: string) => this.builder('update', t, pending, txId),
          selectFrom: (t: string) => this.builder('select', t, pending, txId),
          deleteFrom: (t: string) => this.builder('delete', t, pending, txId),
        };
        try {
          const result = await cb(trx);
          this.committed.push(...pending);
          return result;
        } catch (err) {
          this.rolledBack.push(...pending);
          throw err;
        }
      },
    };
  }

  writes(table: string, kind?: OpKind): FakeOp[] {
    return this.committed.filter((op) => op.table === table && (!kind || op.kind === kind));
  }

  private builder(kind: OpKind, table: string, pending: FakeOp[] | null, txId: number | null) {
    const op: FakeOp = { kind, table, wheres: [], inTransaction: pending !== null, txId };
    const run = async (): Promise<unknown> => {
      const failure = this.failWhen(op);
      if (failure) throw failure;
      const scripted = this.responder(op);
      if (kind === 'select') {
        this.selects.push(op);
        return scripted;
      }
      if (pending) pending.push(op);
      else this.committed.push(op);
      let result: unknown = scripted;
      if (result === undefined) {
        if (kind === 'insert') result = { insertId: BigInt(this.nextId++) };
        else if (kind === 'update') result = { numUpdatedRows: 1n };
        else result = { numDeletedRows: 1n };
      }
      op.result = result;
      return result;
    };
    const chain: Record<string, unknown> = {};
    const self = new Proxy(chain, {
      get: (_target, prop: string) => {
        if (prop === 'values') return (v: Record<string, unknown>) => { op.values = v; return self; };
        if (prop === 'set') return (v: Record<string, unknown>) => { op.set = v; return self; };
        if (prop === 'where') return (a: unknown, b: unknown, c: unknown) => { op.wheres.push([a, b, c]); return self; };
        if (prop === 'execute') {
          return async () => {
            const r = await run();
            return kind === 'select' ? (r ?? []) : [r];
          };
        }
        if (prop === 'executeTakeFirst') {
          return async () => {
            const r = await run();
            return kind === 'select' ? (Array.isArray(r) ? r[0] : r) : r;
          };
        }
        if (prop === 'executeTakeFirstOrThrow') {
          return async () => {
            const r = await run();
            const row = kind === 'select' ? (Array.isArray(r) ? r[0] : r) : r;
            if (row === undefined) throw new Error(`no result for ${kind} ${table}`);
            return row;
          };
        }
        if (prop === 'then') return undefined;
        return () => self;
      },
    });
    return self;
  }
}

export function whereValue(op: FakeOp, column: string): unknown {
  const match = op.wheres.find(([col]) => col === column);
  return match ? match[2] : undefined;
}
