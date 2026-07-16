# DATABASE

# BCC Unified Platform V3

---

## Document Status

APPROVED

AUTHORITATIVE

Living Document

---

## Document ID

DATABASE-001

---

## Classification

Platform Documentation — Database Reference

---

## Authority

Human Authority

Rajnish K. Khare

---

## Platform

BCC Unified Platform V3

---

# Related Documents

This document derives its authority from the following documents in order of precedence:

1. MEM-006 — Membership Constitution & Architecture v1.0
2. MEM-007 — Membership Numbering Constitution v1.0
3. TECH-STACK-FREEZE.md
4. BCC Unified Platform Specification v3
5. PHASE_ROADMAP.md
6. Architecture documents (HUB-ARCH-001, ADMIN-ARCH-001, PHOTO-ARCH-001, etc.)
7. schema.sql (Current Database Schema)

---

# PURPOSE

This document is the human-readable reference for the BCC Unified Platform V3 database.

It explains the purpose, ownership, relationships and structure of every database table used by the platform.

The companion file `schema.sql` remains the authoritative technical definition of the database structure. This document exists to make that schema understandable for developers and AI assistants.

---

# SCOPE

This document covers:

- Database tables
- Purpose of each table
- Primary keys
- Foreign keys
- Important indexes
- Table ownership
- Relationships
- Notes and implementation guidance

This document intentionally does **not** define:

- Business rules
- API endpoints
- Frontend implementation
- CSS or design
- Application workflows

These remain governed by the relevant constitutional, architectural and implementation documents.

---

# DATABASE PRINCIPLES

1. Never assume a table or column exists.
2. `schema.sql` is the authoritative technical source.
3. Table purposes documented here should remain stable even if their structure evolves.
4. Business logic belongs in the application layer, not the database.
5. Foreign keys and indexes should be documented whenever they materially affect application behaviour.

---

# TABLES

```
users
memberships
membership_classes
photos
photo_assets
activities
activity_registrations
journal_posts
...
```

(The list will grow as we document the schema.)

---

# TABLE INDEX

## Core Platform

- schema_migrations

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

## Identity & Authentication

- users

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- auth_identities

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- refresh_tokens

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- login_history

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- magic_links

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- otp_codes

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- mfa_methods

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- email_verification_tokens

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- password_reset_tokens

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- pending_email_changes

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- account_lockouts

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- identity_audit_log

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

## Membership

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- memberships

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_classes

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_application_documents

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_application_messages

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_approval_stages

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_audit_log

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_consent_log

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_number_pool

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_number_log

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- membership_temp_identifiers

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- class_entitlements

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- individual_overrides

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

## Groups

- group_entities

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- group_membership_types

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- group_delegates

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- group_type_entitlements

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks


## Photography

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photos

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photo_tags

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photo_tag_assignments

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photo_comments

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photo_reactions

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photo_albums

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photo_album_items

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- photo_album_genres

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- gallery_spotlight

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

## User Profile

- user_avatars

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- user_cover_photos

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- user_social_handles

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- user_gear

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- user_photo_titles

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- user_awards

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

## Activities / Events

- events

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- event_registrations

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- event_volunteers

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- event_volunteer_slots

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- event_invite_list

## Journal

- journal_posts

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

## Recognition

- member_recognitions

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- recognition_criteria

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- recognition_modifiers

## Notifications

- notification_templates

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- notification_types

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- notification_preferences

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- notification_log

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- in_app_notifications

## Payments

- payments

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

## Security & RBAC

- roles

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- permissions

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- role_permissions

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- user_roles

## Communication

- contact_messages

------------------------------------------------------------
users
------------------------------------------------------------

Purpose

Owner Module

Primary Key

Columns

Indexes

Foreign Keys

Referenced By

Remarks

- invitations

## Voting

- voting_register_snapshots

