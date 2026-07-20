import { Kysely, MysqlDialect, Generated, ColumnType } from 'kysely';
import { createPool } from 'mysql2';

// ---------------------------------------------------------------------------
// Helper: nullable column with no DB DEFAULT (NULL is the implicit default).
// Using ColumnType<T|null, T|null|undefined, T|null> lets Kysely know the
// field is optional on INSERT (omit = MySQL uses NULL) while remaining
// explicitly nullable on UPDATE.
// ---------------------------------------------------------------------------
type Nullable<T> = ColumnType<T | null, T | null | undefined, T | null>;

export interface UsersTable {
  id: Generated<number>;
  uuid: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  full_name: string;
  name_title: Nullable<string>;
  first_name: Nullable<string>;
  middle_name: Nullable<string>;
  last_name: Nullable<string>;
  email_verified_at: ColumnType<Date | null, string | null, string | null>;
  phone_verified_at: ColumnType<Date | null, string | null, string | null>;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  username: string | null;
  identity_status: Generated<'IDENTITY_PENDING' | 'IDENTITY_COMPLETE'>;
  identity_completed_at: ColumnType<Date | null, string | null, string | null>;
  bio: string | null;
  tagline: Nullable<string>;
  awards_html: Nullable<string>;
  photography_genres: Nullable<unknown>;
  areas_of_expertise: Nullable<unknown>;
  favourite_subjects: Nullable<unknown>;
  preferred_camera_system: Nullable<string>;
  city: string | null;
  state: string | null;
  address_line1: Nullable<string>;
  address_line2: Nullable<string>;
  address_line3: Nullable<string>;
  pin_code: Nullable<string>;
  blood_group: Nullable<'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'>;
  emergency_contact_name: Nullable<string>;
  emergency_contact_phone: Nullable<string>;
  emergency_contact_relationship: Nullable<'SPOUSE' | 'PARENT' | 'SIBLING' | 'CHILD' | 'FRIEND' | 'OTHER'>;
  website_url: Nullable<string>;
  country: Generated<string>;
  date_of_birth: ColumnType<Date | null, string | null, string | null>;
  gender: Nullable<'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'>;
  year_joined_bcc: Nullable<number>;
  experience_level: 'BEGINNER' | 'ENTHUSIAST' | 'SERIOUS_AMATEUR' | 'PROFESSIONAL' | null;
  language_pref: Generated<'EN' | 'HI'>;
  profile_visibility: Generated<'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE'>;
  gallery_layout: Generated<'justified' | 'masonry' | 'editorial' | 'modular' | 'metro' | 'magazine'>;
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
  platform:
    | 'INSTAGRAM'
    | 'FLICKR'
    | 'FIVE_HUNDRED_PX'
    | 'YOUTUBE'
    | 'WEBSITE'
    | 'FACEBOOK'
    | 'X_TWITTER'
    | 'TIKTOK'
    | 'LINKEDIN';
  handle_or_url: string;
}

export interface UserCoverPhotosTable {
  id: Generated<number>;
  user_id: number;
  r2_key: string;
  imagekit_url: string;
  is_active: boolean;
  active_lock: number | null;
  uploaded_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface UserPhotoTitlesTable {
  id: Generated<number>;
  user_id: number;
  body_code: 'FIP' | 'PSA' | 'FIAP' | 'GPU' | 'OTHER';
  title_code: string;
  body_name: string | null;
  sort_order: number;
}

export interface UserAwardsTable {
  id: Generated<number>;
  user_id: number;
  award_name: string;
  awarding_body: string | null;
  award_year: number | null;
  description: string | null;
  sort_order: number;
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
// MEM-006 / MEM-007 tables
// ============================================================================

export interface MembershipConsentLogTable {
  id: Generated<number>;
  user_id: number;
  consent_type: 'APPLICATION' | 'RENEWAL';
  terms_version: string;
  ip_address: string | null;
  user_agent: string | null;
  consented_at: Generated<ColumnType<Date, string | undefined, never>>;
}

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
  activation_mode: 'AUTO_AFTER_APPROVAL' | 'PAYMENT_REQUIRED' | 'MANUAL';
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
  added_at: ColumnType<Date, string | undefined, string>;
  removed_at: ColumnType<Date | null, string | null, string | null>;
}

export interface MembershipsTable {
  id: Generated<number>;
  uuid: string;
  owner_type: 'INDIVIDUAL' | 'GROUP';
  user_id: number | null;
  group_entity_id: number | null;
  membership_class_id: number | null;
  group_membership_type_id: number | null;
  lifecycle_state: 'PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'TERMINATED' | 'REJECTED';
  join_year: number | null;
  join_month: number | null;
  number_serial: number | null;
  membership_number: string | null;
  card_verify_token: string | null;
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

// ============================================================================
// Batch 3 -- Group Membership Type separation (migration 0026) +
// Application Workflow (migration 0027)
// ============================================================================

export interface GroupMembershipTypesTable {
  id: Generated<number>;
  code: string;
  name: string;
  entity_type: 'FAMILY' | 'CORPORATE' | 'INSTITUTIONAL';
  is_renewable: boolean;
  sort_order: Generated<number>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface GroupTypeEntitlementsTable {
  id: Generated<number>;
  group_membership_type_id: number;
  entitlement_key: string;
  entitlement_value: string;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface MembershipApplicationDocumentsTable {
  id: Generated<number>;
  uuid: string;
  membership_id: number;
  document_type: string;
  r2_object_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | null;
  upload_status: Generated<'AWAITING_UPLOAD' | 'UPLOADED'>;
  uploaded_at: ColumnType<Date | null, string | null, string | null>;
  uploaded_by_user_id: number | null;
  review_status: Generated<'PENDING_REVIEW' | 'ACCEPTED' | 'REJECTED'>;
  review_note: string | null;
  reviewed_by_user_id: number | null;
  reviewed_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface MembershipApplicationMessagesTable {
  id: Generated<number>;
  membership_id: number;
  message_type: 'INTERNAL_NOTE' | 'CLARIFICATION_REQUEST' | 'APPLICANT_RESPONSE';
  body: string;
  author_user_id: number | null;
  parent_message_id: number | null;
  resolved_at: ColumnType<Date | null, string | null, string | null>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface MembershipApprovalStagesTable {
  id: Generated<number>;
  membership_id: number;
  stage: 'COORDINATOR' | 'COMMITTEE' | 'FINAL';
  decision: 'APPROVED' | 'REJECTED';
  actor_user_id: number | null;
  note: string | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

// ============================================================================
// Batch 4 -- Voting Register (migration 0028, MEM-006 section 02.11)
// ============================================================================

export interface VotingRegisterSnapshotsTable {
  id: Generated<number>;
  uuid: string;
  label: string;
  generated_by_user_id: number | null;
  eligible_count: number;
  quorum_threshold: number;
  snapshot_json: string;
  generated_at: Generated<ColumnType<Date, string | undefined, never>>;
}

// ============================================================================
// Module 17 -- Communication Engine (migrations 0030-0032)
// ============================================================================

export interface NotificationTypesTable {
  id: Generated<number>;
  type_key: string;
  category: 'TRANSACTIONAL' | 'LIFECYCLE' | 'ALERT' | 'BROADCAST' | 'DIGEST';
  module: string;
  trigger_event: string;
  fires_email: boolean;
  fires_in_app: boolean;
  fires_whatsapp: boolean;
  fires_sms: boolean;
  is_opt_outable: boolean;
  is_active: boolean;
}

export interface NotificationTemplatesTable {
  id: Generated<number>;
  type_key: string;
  channel: 'EMAIL' | 'IN_APP' | 'WHATSAPP' | 'SMS';
  subject_en: string | null;
  body_en: string;
  subject_hi: string | null;
  body_hi: string | null;
  variables: unknown | null;
  version: Generated<number>;
  is_active: Generated<boolean>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface NotificationLogTable {
  id: Generated<number>;
  type_key: string;
  user_id: number;
  channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP' | 'SMS';
  status: Generated<'QUEUED' | 'SENT' | 'FAILED' | 'BOUNCED' | 'SKIPPED'>;
  provider_message_id: string | null;
  variables_snapshot: unknown | null;
  skip_reason: string | null;
  sent_at: ColumnType<Date | null, string | null, string | null>;
  failed_at: ColumnType<Date | null, string | null, string | null>;
  retry_count: Generated<number>;
  error_detail: string | null;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface InAppNotificationsTable {
  id: Generated<number>;
  log_id: number;
  user_id: number;
  title: string;
  body: string;
  action_url: string | null;
  is_read: Generated<boolean>;
  read_at: ColumnType<Date | null, string | null, string | null>;
  expires_at: ColumnType<Date, string, string>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

// ============================================================================
// Module 04 -- Events & Activity Management (migration 0033)
// ============================================================================

export type EventType =
  | 'PHOTOWALK' | 'BIRD_WALK' | 'WORKSHOP' | 'SEMINAR'
  | 'TOUR' | 'MEETUP' | 'TRAINING' | 'CONSERVATION'
  | 'EXHIBITION_EVENT' | 'GOVERNANCE' | 'AWARD_CEREMONY'
  | 'ONLINE' | 'COLLABORATIVE' | 'OTHER';

export type EventState = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type EligibilityMode =
  | 'OPEN' | 'MEMBERS_ONLY' | 'SPECIFIC_CLASSES'
  | 'INVITE_ONLY' | 'CONSTITUTIONAL_MEMBERS_ONLY';
export type RegistrationStatus = 'REGISTERED' | 'WAITLISTED' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW';
export type VolunteerStatus = 'APPLIED' | 'CONFIRMED' | 'CHECKED_IN' | 'NO_SHOW' | 'CANCELLED';

export interface EventsTable {
  id: Generated<number>;
  uuid: string;
  slug: string;
  title: string;
  description: string | null;
  event_type: EventType;
  occurrence: Generated<'SINGLE' | 'RECURRING'>;
  starts_at: ColumnType<Date, string, string>;
  ends_at: ColumnType<Date | null, string | null, string | null>;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_landmark: string | null;
  capacity: number | null;
  waitlist_enabled: Generated<boolean>;
  fee_type: Generated<'FREE' | 'FLAT' | 'MEMBER_DISCOUNTED'>;
  base_fee_paise: Generated<number>;
  eligibility_mode: Generated<EligibilityMode>;
  allowed_class_ids: string | null;
  difficulty_level: Generated<'ALL' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'>;
  age_restriction: Generated<'ALL' | 'ADULT' | 'FAMILY'>;
  weather_dependent: Generated<boolean>;
  volunteer_slots_needed: Generated<number>;
  what_to_bring: string | null;
  tags: string | null;
  banner_r2_key: string | null;
  state: Generated<EventState>;
  cancellation_reason: string | null;
  created_by: number;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}

export interface EventInviteListTable {
  id: Generated<number>;
  event_id: number;
  user_id: number;
  invited_by: number;
  invited_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface EventRegistrationsTable {
  id: Generated<number>;
  uuid: string;
  event_id: number;
  user_id: number | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  registration_type: 'MEMBER' | 'GUEST';
  status: Generated<RegistrationStatus>;
  waitlist_position: number | null;
  fee_paid_paise: Generated<number>;
  checked_in_at: ColumnType<Date | null, string | null, string | null>;
  checked_in_by: number | null;
  registered_at: Generated<ColumnType<Date, string | undefined, never>>;
  cancelled_at: ColumnType<Date | null, string | null, string | null>;
  cancellation_reason: string | null;
}

export interface EventVolunteerSlotsTable {
  id: Generated<number>;
  event_id: number;
  role_name: string;
  role_description: string | null;
  skills_required: string | null;
  slots_count: Generated<number>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface EventVolunteersTable {
  id: Generated<number>;
  event_id: number;
  slot_id: number | null;
  user_id: number;
  status: Generated<VolunteerStatus>;
  hours_logged: number | null;
  applied_at: Generated<ColumnType<Date, string | undefined, never>>;
  confirmed_at: ColumnType<Date | null, string | null, string | null>;
  checked_in_at: ColumnType<Date | null, string | null, string | null>;
}

// ============================================================================
// Module 05 -- Photography Gallery & Digital Archive (migration 0034)
// ============================================================================

export type PhotoFileFormat =
  | 'JPEG' | 'PNG' | 'TIFF' | 'HEIC' | 'WEBP'
  | 'NEF' | 'CR2' | 'CR3' | 'ARW' | 'ORF' | 'DNG' | 'OTHER';

export type PhotoStatus = 'PROCESSING' | 'ACTIVE' | 'DELETED';
export type PhotoVisibility = 'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE' | 'UNLISTED';

export interface PhotosTable {
  id:                 Generated<number>;
  uuid:               string;
  owner_user_id:      number;
  r2_key:             string;
  original_filename:  string;
  mime_type:          string;
  file_format:        PhotoFileFormat;
  // file_size_bytes: updated from R2 HEAD on /confirm; nullable until confirmed.
  file_size_bytes:    Nullable<number>;
  // sha256_hash: optional, client-provided on /confirm.
  sha256_hash:        Nullable<string>;
  status:             Generated<PhotoStatus>;
  confirmed_at:       ColumnType<Date | null, string | null, string | null>;
  deleted_at:         ColumnType<Date | null, string | null, string | null>;
  // Content metadata -- all optional, owner sets on /confirm or PATCH.
  title:              Nullable<string>;
  caption:            Nullable<string>;
  description:        Nullable<string>;
  exhibition_label:   Nullable<string>;
  width_px:           Nullable<number>;
  height_px:          Nullable<number>;
  // EXIF -- all optional, client-provided on /confirm.
  exif_camera_make:   Nullable<string>;
  exif_camera_model:  Nullable<string>;
  exif_lens_model:    Nullable<string>;
  exif_focal_length:  Nullable<number>;
  exif_aperture:      Nullable<number>;
  exif_shutter_speed: Nullable<string>;
  exif_iso:           Nullable<number>;
  exif_taken_at:      ColumnType<Date | null, string | null, string | null>;
  exif_gps_lat:       Nullable<number>;
  exif_gps_lng:       Nullable<number>;
  gps_stripped:       Generated<boolean>;
  visibility:         Generated<PhotoVisibility>;
  // show_in_portfolio — added by migration 0077.
  // When false, photo is excluded from the photographer portfolio listing only.
  // Has no effect on hero eligibility or any admin tool.
  show_in_portfolio:  Generated<boolean>;
  source_event_id:    Nullable<number>;
  view_count:         Generated<number>;
  created_at:         Generated<ColumnType<Date, string | undefined, never>>;
  updated_at:         Generated<ColumnType<Date, string | undefined, string>>;
}

export type AlbumType = 'MEMBER_CREATED' | 'AUTO_EVENT' | 'AUTO_CONTEST';
export type AlbumVisibility = 'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE';

export interface PhotoAlbumsTable {
  id:             Generated<number>;
  uuid:           string;
  owner_user_id:  number;
  title:          string;
  // Editorial framing (item 69). eyebrow = kicker above title, subtitle = one-liner.
  eyebrow:        Nullable<string>;
  subtitle:       Nullable<string>;
  description:    Nullable<string>;
  cover_photo_id: Nullable<number>;
  album_type:     Generated<AlbumType>;
  kind:           Generated<'COLLECTION' | 'STORY'>;
  source_ref_id:  Nullable<number>;
  visibility:     Generated<AlbumVisibility>;
  sort_order:     Generated<number>;
  created_at:     Generated<ColumnType<Date, string | undefined, never>>;
  updated_at:     Generated<ColumnType<Date, string | undefined, string>>;
}

export interface PhotoAlbumItemsTable {
  id:         Generated<number>;
  album_id:   number;
  photo_id:   number;
  sort_order: Generated<number>;
  added_at:   Generated<ColumnType<Date, string | undefined, never>>;
}

export interface PhotoAlbumGenresTable {
  id:       Generated<number>;
  album_id: number;
  tag_id:   number;
}

export type TagCategory = 'GENRE' | 'SUBJECT' | 'LOCATION' | 'EQUIPMENT' | 'CUSTOM' | 'PROJECT';

export interface PhotoTagsTable {
  id:           Generated<number>;
  tag_key:      string;
  display_name: string;
  category:     TagCategory;
  is_system:    Generated<boolean>;
  is_active:    Generated<boolean>;
  created_at:   Generated<ColumnType<Date, string | undefined, never>>;
}

export interface PhotoTagAssignmentsTable {
  photo_id:    number;
  tag_id:      number;
  assigned_by: number;
  assigned_at: ColumnType<Date, string, string>;
}

export type PhotoReactionType = 'LIKE' | 'FAVOURITE' | 'BOOKMARK';

export interface PhotoReactionsTable {
  id:            Generated<number>;
  photo_id:      number;
  user_id:       number;
  reaction_type: PhotoReactionType;
  created_at:    Generated<ColumnType<Date, string | undefined, never>>;
}

export interface PhotoCommentsTable {
  id:         Generated<number>;
  photo_id:   number;
  user_id:    number;
  body:       string;
  is_deleted: Generated<boolean>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
  updated_at: Generated<ColumnType<Date, string | undefined, string>>;
}


// ============================================================================
// Gallery Spotlight
// ============================================================================

export interface GallerySpotlightTable {
  id:              number;                                         // always 1 (single-row config)
  photo_uuid:      string;
  title_override:  Nullable<string>;
  credit_override: Nullable<string>;
  set_by_user_id:  number;
  set_at:          Generated<ColumnType<Date, string | undefined, string>>;
}

// ============================================================================
// Editorial Hero Assignments
// ============================================================================

export interface HeroAssignmentsTable {
  id:          Generated<number>;
  photo_uuid:  string;
  location:    string;
  mode:        'FIXED' | 'POOL';
  assigned_by: number;
  assigned_at: Generated<ColumnType<Date, string | undefined, never>>;
}

// ============================================================================
// Journal
// ============================================================================

export type JournalStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface JournalPostsTable {
  id:                   Generated<number>;
  uuid:                 string;
  slug:                 string;
  title:                string;
  description:          Nullable<string>;
  body:                 string;
  excerpt:              Nullable<string>;
  // category has DB DEFAULT 'Guide' — optional on INSERT
  category:             Generated<string>;
  tags:                 Nullable<string>;          // JSON array stored as string
  hero_image_url:       Nullable<string>;
  hero_r2_key:          Nullable<string>;
  // reading_time_minutes has DB DEFAULT 5 — optional on INSERT
  reading_time_minutes: Generated<number>;
  author_user_id:       Nullable<number>;          // FK -> users.id ON DELETE SET NULL
  // author_display_name has DB DEFAULT 'Bhopal Camera Club'
  author_display_name:  Generated<string>;
  // status has DB DEFAULT 'DRAFT'
  status:               Generated<JournalStatus>;
  published_at:         ColumnType<Date | null, string | null, string | null>;
  seo_title:            Nullable<string>;
  seo_description:      Nullable<string>;
  created_at:           ColumnType<Date, string, string>;
  updated_at:           ColumnType<Date, string, string>;
}

export interface PendingEmailChangesTable {
  id: Generated<number>;
  user_id: number;
  new_email: string;
  token_hash: string;
  expires_at: ColumnType<Date, string, string>;
  created_at: Generated<ColumnType<Date, string | undefined, never>>;
}

export interface ContactMessagesTable {
  id:           Generated<number>;
  name:         string;
  email:        string;
  phone:        string | null;
  subject:      string;
  message:      string;
  ip_address:   string | null;
  user_agent:   string | null;
  submitted_at: Generated<ColumnType<Date, string | undefined, never>>;
  status:       Generated<'NEW' | 'READ' | 'RESPONDED' | 'CLOSED' | 'SPAM'>;
}

// ============================================================================
// Database interface
// ============================================================================

export interface DB {
  pending_email_changes: PendingEmailChangesTable;
  contact_messages: ContactMessagesTable;
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
  user_cover_photos: UserCoverPhotosTable;
  user_photo_titles: UserPhotoTitlesTable;
  user_awards: UserAwardsTable;
  user_gear: UserGearTable;
  notification_preferences: NotificationPreferencesTable;
  roles: RolesTable;
  permissions: PermissionsTable;
  role_permissions: RolePermissionsTable;
  user_roles: UserRolesTable;
  identity_audit_log: IdentityAuditLogTable;

  membership_consent_log: MembershipConsentLogTable;
  membership_classes: MembershipClassesTable;
  group_entities: GroupEntitiesTable;
  group_delegates: GroupDelegatesTable;
  memberships: MembershipsTable;
  member_recognitions: MemberRecognitionsTable;
  class_entitlements: ClassEntitlementsTable;
  group_membership_types: GroupMembershipTypesTable;
  group_type_entitlements: GroupTypeEntitlementsTable;
  recognition_modifiers: RecognitionModifiersTable;
  individual_overrides: IndividualOverridesTable;
  recognition_criteria: RecognitionCriteriaTable;
  membership_audit_log: MembershipAuditLogTable;
  membership_number_pool: MembershipNumberPoolTable;
  membership_number_log: MembershipNumberLogTable;
  membership_temp_identifiers: MembershipTempIdentifiersTable;
  payments: PaymentsTable;
  membership_application_documents: MembershipApplicationDocumentsTable;
  membership_application_messages: MembershipApplicationMessagesTable;
  membership_approval_stages: MembershipApprovalStagesTable;
  voting_register_snapshots: VotingRegisterSnapshotsTable;
  notification_types: NotificationTypesTable;
  notification_templates: NotificationTemplatesTable;
  notification_log: NotificationLogTable;
  in_app_notifications: InAppNotificationsTable;

  events: EventsTable;
  event_invite_list: EventInviteListTable;
  event_registrations: EventRegistrationsTable;
  event_volunteer_slots: EventVolunteerSlotsTable;
  event_volunteers: EventVolunteersTable;

  photos: PhotosTable;
  photo_albums: PhotoAlbumsTable;
  photo_album_items: PhotoAlbumItemsTable;
  photo_album_genres: PhotoAlbumGenresTable;
  photo_tags: PhotoTagsTable;
  photo_tag_assignments: PhotoTagAssignmentsTable;
  photo_reactions: PhotoReactionsTable;
  photo_comments: PhotoCommentsTable;
  gallery_spotlight: GallerySpotlightTable;
  hero_assignments: HeroAssignmentsTable;

  journal_posts: JournalPostsTable;
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
