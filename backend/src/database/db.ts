import { Kysely, MysqlDialect, Generated, ColumnType } from 'kysely';
import { createPool } from 'mysql2';

export interface UsersTable {
  id: Generated<number>;
  uuid: string;
  email: string;
  phone: string | null;
  password_hash: string | null;
  full_name: string;
  email_verified_at: ColumnType<Date | null, string | null, string | null>;
  phone_verified_at: ColumnType<Date | null, string | null, string | null>;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  username: string | null;
  bio: string | null;
  city: string | null;
  state: string | null;
  country: Generated<string>;
  date_of_birth: ColumnType<Date | null, string | null, string | null>;
  experience_level: 'BEGINNER' | 'ENTHUSIAST' | 'SERIOUS_AMATEUR' | 'PROFESSIONAL' | null;
  language_pref: Generated<'EN' | 'HI'>;
  profile_visibility: Generated<'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE'>;
  portfolio_visibility: Generated<'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE'>;
  activity_visibility: Generated<'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE'>;
  deletion_requested_at: ColumnType<Date | null, string | null, string | null>;
  deleted_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface UserAvatarsTable {
  id: Generated<number>;
  user_id: number;
  size_variant: 'THUMB' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'ORIGINAL';
  r2_key: string;
  imagekit_url: string;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface AuthIdentitiesTable {
  id: Generated<number>;
  user_id: number;
  provider: 'GOOGLE' | 'FACEBOOK' | 'INSTAGRAM';
  provider_user_id: string;
  linked_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface OtpCodesTable {
  id: Generated<number>;
  user_id: number | null;
  phone: string;
  code_hash: string;
  purpose: 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET';
  expires_at: ColumnType<Date, string, string>;
  consumed_at: ColumnType<Date | null, string | null, string | null>;
  attempt_count: Generated<number>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface MagicLinksTable {
  id: Generated<number>;
  email: string;
  token_hash: string;
  expires_at: ColumnType<Date, string, string>;
  consumed_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface PasswordResetTokensTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  expires_at: ColumnType<Date, string, string>;
  consumed_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface RefreshTokensTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  device_label: string | null;
  ip_address: string | null;
  user_agent: string | null;
  issued_at: Generated<ColumnType<Date, string | undefined, never>>;
  last_used_at: ColumnType<Date | null, string | null, string | null>;
  expires_at: ColumnType<Date, string, string>;
  revoked_at: ColumnType<Date | null, string | null, string | null>;
  replaced_by_token_id: number | null;
}

export interface LoginHistoryTable {
  id: Generated<number>;
  user_id: number | null;
  email_attempted: string | null;
  ip_address: string | null;
  device: string | null;
  location: string | null;
  status: 'SUCCESS' | 'FAILED' | 'LOCKED';
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface AccountLockoutsTable {
  id: Generated<number>;
  user_id: number;
  failed_attempts: Generated<number>;
  locked_at: ColumnType<Date | null, string | null, string | null>;
  unlocked_at: ColumnType<Date | null, string | null, string | null>;
  unlocked_by: number | null;
}

export interface MfaMethodsTable {
  id: Generated<number>;
  user_id: number;
  method: 'TOTP' | 'SMS' | 'EMAIL';
  secret_encrypted: string | null;
  enabled_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface UserSocialHandlesTable {
  id: Generated<number>;
  user_id: number;
  platform: 'INSTAGRAM' | 'FLICKR' | 'FIVE_HUNDRED_PX' | 'YOUTUBE' | 'WEBSITE';
  handle_or_url: string;
}

export interface UserGearTable {
  id: Generated<number>;
  user_id: number;
  gear_type: 'BODY' | 'LENS' | 'ACCESSORY';
  label: string;
}

export interface NotificationPreferencesTable {
  id: Generated<number>;
  user_id: number;
  notification_type: string;
  channel: 'IN_APP' | 'WHATSAPP' | 'EMAIL' | 'SMS';
  opted_in: Generated<boolean>;
}

export interface RolesTable {
  id: Generated<number>;
  name: string;
  category: 'SYSTEM' | 'OPERATIONAL';
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface PermissionsTable {
  id: Generated<number>;
  permission_key: string;
  description: string | null;
}

export interface RolePermissionsTable {
  role_id: number;
  permission_id: number;
}

export interface UserRolesTable {
  id: Generated<number>;
  user_id: number;
  role_id: number;
  scope_type: string | null;
  scope_id: number | null;
  valid_from: Generated<ColumnType<Date, string | undefined, never>>;
  valid_until: ColumnType<Date | null, string | null, string | null>;
  granted_by: number;
}

export interface IdentityAuditLogTable {
  id: Generated<number>;
  actor_id: number | null;
  target_user_id: number;
  action_type: string;
  old_value: unknown | null;
  new_value: unknown | null;
  reason: string | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface DB {
  users: UsersTable;
  user_avatars: UserAvatarsTable;
  auth_identities: AuthIdentitiesTable;
  otp_codes: OtpCodesTable;
  magic_links: MagicLinksTable;
  password_reset_tokens: PasswordResetTokensTable;
  refresh_tokens: RefreshTokensTable;
  login_history: LoginHistoryTable;
  account_lockouts: AccountLockoutsTable;
  mfa_methods: MfaMethodsTable;
  user_social_handles: UserSocialHandlesTable;
  user_gear: UserGearTable;
  notification_preferences: NotificationPreferencesTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  user_roles: UserRolesTable;
  identity_audit_log: IdentityAuditLogTable;
}

const dialect = new MysqlDialect({
  pool: createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: 5,
  }),
});

export const db = new Kysely<DB>({ dialect });
