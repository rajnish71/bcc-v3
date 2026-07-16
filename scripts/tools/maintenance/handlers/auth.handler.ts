import { Kysely } from 'kysely';
import { DB } from '../../../../backend/src/database/db';
import { MaintenanceHandler, DependencyReport, DeletionStep } from './base';

export class AuthHandler implements MaintenanceHandler {
  getHandledFKs(): string[] {
    return [
      'auth_identities.user_id',
      'refresh_tokens.user_id',
      'otp_codes.user_id',
      'password_reset_tokens.user_id',
      'email_verification_tokens.user_id',
      'invitations.invited_by',
      'login_history.user_id',
      'account_lockouts.user_id',
      'account_lockouts.unlocked_by',
      'mfa_methods.user_id',
      'pending_email_changes.user_id'
    ];
  }

  getDeletionSteps(): DeletionStep[] {
    return [
      {
        table: 'account_lockouts',
        action: 'nullify',
        description: 'Nullify unlocked_by references to target user',
        phase: 4
      },
      {
        table: 'auth_identities',
        action: 'delete',
        description: 'Delete social auth identities of target user',
        phase: 5
      },
      {
        table: 'refresh_tokens',
        action: 'delete',
        description: 'Delete refresh tokens of target user',
        phase: 5
      },
      {
        table: 'otp_codes',
        action: 'delete',
        description: 'Delete OTP codes of target user',
        phase: 5
      },
      {
        table: 'password_reset_tokens',
        action: 'delete',
        description: 'Delete password reset tokens of target user',
        phase: 5
      },
      {
        table: 'email_verification_tokens',
        action: 'delete',
        description: 'Delete email verification tokens of target user',
        phase: 5
      },
      {
        table: 'invitations',
        action: 'delete',
        description: 'Delete invitations sent by target user',
        phase: 5
      },
      {
        table: 'login_history',
        action: 'delete',
        description: 'Delete login history of target user',
        phase: 5
      },
      {
        table: 'account_lockouts',
        action: 'delete',
        description: 'Delete account lockout records of target user',
        phase: 5
      },
      {
        table: 'mfa_methods',
        action: 'delete',
        description: 'Delete MFA methods enabled by target user',
        phase: 5
      },
      {
        table: 'pending_email_changes',
        action: 'delete',
        description: 'Delete pending email change requests of target user',
        phase: 5
      },
      {
        table: 'magic_links',
        action: 'delete',
        description: 'Delete magic link tokens linked to target user\'s email',
        phase: 5
      }
    ];
  }

  async inspect(db: Kysely<DB>, userIds: number[]): Promise<DependencyReport> {
    if (userIds.length === 0) return {};

    const report: DependencyReport = {};

    const countRows = async (table: keyof DB, column: string, filterCol: string) => {
      const res = await db
        .selectFrom(table as any)
        .select(db.fn.count(filterCol as any).as('count'))
        .where(filterCol as any, 'in', userIds)
        .executeTakeFirst();
      const count = Number(res?.count ?? 0);
      if (count > 0) {
        if (!report[table as string]) report[table as string] = {};
        report[table as string][column] = count;
      }
    };

    await countRows('auth_identities', 'user_id', 'user_id');
    await countRows('refresh_tokens', 'user_id', 'user_id');
    await countRows('otp_codes', 'user_id', 'user_id');
    await countRows('password_reset_tokens', 'user_id', 'user_id');
    await countRows('email_verification_tokens', 'user_id', 'user_id');
    await countRows('invitations', 'invited_by', 'invited_by');
    await countRows('login_history', 'user_id', 'user_id');
    await countRows('account_lockouts', 'user_id', 'user_id');
    await countRows('account_lockouts', 'unlocked_by', 'unlocked_by');
    await countRows('mfa_methods', 'user_id', 'user_id');
    await countRows('pending_email_changes', 'user_id', 'user_id');

    // Handle magic_links (linked by email, not a formal FK but we inspect it)
    const emails = await db
      .selectFrom('users')
      .select('email')
      .where('id', 'in', userIds)
      .where('email', 'is not', null)
      .execute();
    const emailList = emails.map(u => u.email).filter((e): e is string => !!e);
    if (emailList.length > 0) {
      const magicRes = await db
        .selectFrom('magic_links')
        .select(db.fn.count('id').as('count'))
        .where('email', 'in', emailList)
        .executeTakeFirst();
      const magicCount = Number(magicRes?.count ?? 0);
      if (magicCount > 0) {
        report['magic_links'] = { email: magicCount };
      }
    }

    return report;
  }

  async delete(db: Kysely<DB>, userIds: number[]): Promise<void> {
    const emails = await db
      .selectFrom('users')
      .select('email')
      .where('id', 'in', userIds)
      .where('email', 'is not', null)
      .execute();
    const emailList = emails.map(u => u.email).filter((e): e is string => !!e);

    // Nullify unlocked_by in account_lockouts
    await db
      .updateTable('account_lockouts')
      .set({ unlocked_by: null })
      .where('unlocked_by', 'in', userIds)
      .execute();

    // Delete direct auth records
    await db.deleteFrom('auth_identities').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('refresh_tokens').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('otp_codes').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('password_reset_tokens').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('email_verification_tokens').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('invitations').where('invited_by', 'in', userIds).execute();
    await db.deleteFrom('login_history').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('account_lockouts').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('mfa_methods').where('user_id', 'in', userIds).execute();
    await db.deleteFrom('pending_email_changes').where('user_id', 'in', userIds).execute();

    if (emailList.length > 0) {
      await db.deleteFrom('magic_links').where('email', 'in', emailList).execute();
    }
  }
}
