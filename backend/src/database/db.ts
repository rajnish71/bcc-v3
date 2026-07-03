import { Kysely, MysqlDialect, Generated, ColumnType } from 'kysely';
import { createPool } from 'mysql2';

export interface UsersTable {
  id: Generated<number>;
  uuid: string;
  email: string | null;
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
  registration_method: Generated<'EMAIL_PASSWORD' | 'PHONE_OTP' | 'SOCIAL_LOGIN' | 'MAGIC_LINK' | 'ADMIN_CREATED' | 'INVITATION'>;
  force_password_reset: Generated<boolean>;
  created_by: number | null;
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

export interface EmailVerificationTokensTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  expires_at: ColumnType<Date, string, string>;
  consumed_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface InvitationsTable {
  id: Generated<number>;
  email: string;
  token_hash: string;
  invited_by: number;
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

// ============================================================================
// MEM-006 / MEM-007 tables (Phase 0, migrations 0001-0009) -- typed here for
// the first time as part of Module 02's build. The schema already existed;
// only the Kysely typing was missing.
// ============================================================================

export interface MembershipClassesTable {
  id: Generated<number>;
  code: string;
  name: string;
  type: 'CONSTITUTIONAL' | 'OPERATIONAL';
  voting_eligible: boolean;
  governance_eligible: boolean;
  is_renewable: boolean;
  is_lifetime: boolean;
  is_closed: boolean;
  sort_order: Generated<number>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface GroupEntitiesTable {
  id: Generated<number>;
  uuid: string;
  type: 'FAMILY' | 'CORPORATE' | 'INSTITUTIONAL';
  name: string;
  primary_contact_user_id: number | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface GroupDelegatesTable {
  id: Generated<number>;
  group_entity_id: number;
  user_id: number;
  role: Generated<string>;
  added_at: Generated<ColumnType<Date, string | undefined, never>>;
  removed_at: ColumnType<Date | null, string | null, string | null>;
}

export interface MembershipsTable {
  id: Generated<number>;
  uuid: string;
  owner_type: 'INDIVIDUAL' | 'GROUP';
  user_id: number | null;
  group_entity_id: number | null;
  membership_class_id: number;
  lifecycle_state: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TERMINATED' | 'REJECTED';
  join_year: number | null;
  join_month: number | null;
  number_serial: number | null;
  membership_number: string | null;
  number_assigned_at: ColumnType<Date | null, string | null, string | null>;
  last_payment_status: Generated<'NONE' | 'PENDING' | 'FAILED' | 'SUCCEEDED'>;
  pending_payment_id: number | null;
  applied_at: ColumnType<Date | null, string | null, string | null>;
  approved_at: ColumnType<Date | null, string | null, string | null>;
  activated_at: ColumnType<Date | null, string | null, string | null>;
  expires_at: ColumnType<Date | null, string | null, string | null>;
  terminated_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface MemberRecognitionsTable {
  id: Generated<number>;
  membership_id: number;
  recognition_code:
    | 'SENIOR_MEMBER'
    | 'HONORARY_SENIOR_MEMBER'
    | 'HONORARY_MEMBER'
    | 'HONORARY_MENTOR'
    | 'HONORARY_GRANDMASTER';
  track: 'AUTO' | 'MANUAL';
  status: Generated<'ACTIVE' | 'HISTORICAL'>;
  reason: string | null;
  assigned_by_user_id: number | null;
  start_date: ColumnType<Date, string, string>;
  end_date: ColumnType<Date | null, string | null, string | null>;
  // Generated STORED column (IF(status='ACTIVE', membership_id, NULL)) --
  // never write to this column directly.
  active_lock: Generated<number | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface ClassEntitlementsTable {
  id: Generated<number>;
  membership_class_id: number;
  entitlement_key: string;
  entitlement_value: string;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface RecognitionModifiersTable {
  id: Generated<number>;
  recognition_code:
    | 'SENIOR_MEMBER'
    | 'HONORARY_SENIOR_MEMBER'
    | 'HONORARY_MEMBER'
    | 'HONORARY_MENTOR'
    | 'HONORARY_GRANDMASTER';
  entitlement_key: string;
  modifier_value: string;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface IndividualOverridesTable {
  id: Generated<number>;
  membership_id: number;
  entitlement_key: string;
  override_type: Generated<'GRANT' | 'REVOKE'>;
  override_value: string;
  reason: string;
  expires_at: ColumnType<Date | null, string | null, string | null>;
  created_by_user_id: number | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface RecognitionCriteriaTable {
  id: Generated<number>;
  recognition_code:
    | 'SENIOR_MEMBER'
    | 'HONORARY_SENIOR_MEMBER'
    | 'HONORARY_MEMBER'
    | 'HONORARY_MENTOR'
    | 'HONORARY_GRANDMASTER';
  criteria_key: string;
  criteria_value: string;
  updated_by_user_id: number | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface MembershipAuditLogTable {
  id: Generated<number>;
  membership_id: number | null;
  event_type: string;
  actor_type: 'SYSTEM' | 'ADMIN' | 'MEMBER';
  actor_user_id: number | null;
  old_value: string | null;
  new_value: string | null;
  notes: string | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface MembershipNumberPoolTable {
  id: Generated<number>;
  next_operational_serial: number;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface MembershipNumberLogTable {
  id: Generated<number>;
  membership_id: number;
  number_serial: number;
  membership_number: string;
  assignment_type: 'FOUNDING_RESERVED' | 'HISTORICAL_RESERVED' | 'OPERATIONAL_SEQUENTIAL' | 'HISTORICAL_MIGRATION_IMPORT';
  assigned_by_user_id: number | null;
  notes: string | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface MembershipTempIdentifiersTable {
  id: Generated<number>;
  membership_id: number;
  temp_identifier: string;
  status: Generated<'ACTIVE' | 'RETIRED'>;
  issued_at: Generated<ColumnType<Date, string | undefined, never>>;
  retired_at: ColumnType<Date | null, string | null, string | null>;
}

// ============================================================================
// payments (migration 0023, this session) -- minimal, Module 11 expected to
// ALTER this table rather than replace it.
// ============================================================================

export interface PaymentsTable {
  id: Generated<number>;
  uuid: string;
  membership_id: number;
  purpose: Generated<'MEMBERSHIP_FEE' | 'RENEWAL_FEE'>;
  amount_paise: number;
  currency: Generated<string>;
  provider: 'RAZORPAY' | 'MANUAL';
  provider_order_id: string | null;
  provider_payment_id: string | null;
  idempotency_key: string | null;
  status: Generated<'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED'>;
  recorded_by_user_id: number | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface DB {
  users: UsersTable;
  user_avatars: UserAvatarsTable;
  auth_identities: AuthIdentitiesTable;
  otp_codes: OtpCodesTable;
  magic_links: MagicLinksTable;
  password_reset_tokens: PasswordResetTokensTable;
  email_verification_tokens: EmailVerificationTokensTable;
  invitations: InvitationsTable;
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

  membership_classes: MembershipClassesTable;
  group_entities: GroupEntitiesTable;
  group_delegates: GroupDelegatesTable;
  memberships: MembershipsTable;
  member_recognitions: MemberRecognitionsTable;
  class_entitlements: ClassEntitlementsTable;
  recognition_modifiers: RecognitionModifiersTable;
  individual_overrides: IndividualOverridesTable;
  recognition_criteria: RecognitionCriteriaTable;
  membership_audit_log: MembershipAuditLogTable;
  membership_number_pool: MembershipNumberPoolTable;
  membership_number_log: MembershipNumberLogTable;
  membership_temp_identifiers: MembershipTempIdentifiersTable;
  payments: PaymentsTable;
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
