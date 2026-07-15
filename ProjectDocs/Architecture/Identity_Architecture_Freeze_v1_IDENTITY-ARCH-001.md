# IDENTITY-ARCH-001

# IDENTITY ARCHITECTURE FREEZE v1.0

------------------------------------------------------------

Document Status

APPROVED
FROZEN
AUTHORITATIVE

------------------------------------------------------------

Document ID

IDENTITY-ARCH-001

------------------------------------------------------------

Classification

Backend / Platform Architecture

Identity Management

------------------------------------------------------------

Authority

Human Authority
Rajnish K. Khare

------------------------------------------------------------

Platform

BCC Unified Platform V3

------------------------------------------------------------

Related Documents (Authority Order)

1. MEM-006 Membership Constitution
2. MEM-007 Membership Numbering Constitution
3. TECH-STACK-FREEZE
4. PHASE_ROADMAP
5. HUB-ARCH-001
6. ADMIN-ARCH-001
7. BCC Unified Platform Specification

------------------------------------------------------------
PURPOSE
------------------------------------------------------------

This document establishes the canonical Identity Architecture for the
BCC Unified Platform.

It governs:

• Identity lifecycle
• Identity completion
• Username ownership
• Authentication provider convergence
• Identity validation
• Identity status
• Identity recovery

It does NOT govern:

• Membership
• Recognition
• RBAC
• Public Profile design
• Photographer Directory

------------------------------------------------------------
PRINCIPLE 1

Identity is independent of Membership.

Registration creates a Registered User only.

Registration never creates:

• Membership
• Recognition
• Voting Rights
• Administrative Authority

MEM-006 remains authoritative.

------------------------------------------------------------
PRINCIPLE 2

Every Registered User shall possess a complete Identity before accessing
authenticated platform functionality.

An incomplete identity shall never access Hub functionality.

------------------------------------------------------------
PRINCIPLE 3

Authentication providers never implement Identity logic.

Authentication providers only authenticate.

All providers converge into a single Identity Completion workflow.

Supported providers include:

Email

Google

Facebook

Magic Link

Invitation

Admin-created Account

Future providers

------------------------------------------------------------
IDENTITY LIFECYCLE

Anonymous

↓

Authenticated

↓

IDENTITY_PENDING

↓

Identity Completion

↓

IDENTITY_COMPLETE

↓

Normal Platform Access

↓

Optional Membership Application

------------------------------------------------------------
IDENTITY STATUS

users.identity_status

ENUM

IDENTITY_PENDING

IDENTITY_COMPLETE

users.identity_completed_at

DATETIME NULL

Purpose

Identity completion must never be inferred from username NULL.

Identity Status is the single authoritative state.

------------------------------------------------------------
USERNAME

Username is mandatory.

Rules

• globally unique
• immutable after creation (future policy if changed)
• URL safe
• lowercase
• validated
• reserved atomically
• chosen only by the identity owner

Administrators shall never assign usernames.

------------------------------------------------------------
DISPLAY NAME

Display Name is independent of Username.

OAuth providers may pre-populate Display Name.

Identity Completion shall request Display Name only if missing.

------------------------------------------------------------
PUBLIC PROFILE

Identity Completion SHALL NOT automatically enable public profile visibility.

Profile visibility remains an independent user preference.

Public profile eligibility continues to depend upon existing visibility rules.

------------------------------------------------------------
AUTHENTICATION FLOW

Authentication succeeds

↓

Identity Status?

↓

IDENTITY_COMPLETE

↓

Continue

↓

IDENTITY_PENDING

↓

Redirect

/auth/identity-complete

------------------------------------------------------------
IDENTITY COMPLETION

Responsibilities

Validate username

Reserve username

Store username

Record completion timestamp

Update identity status

Return user to requested page

Identity Completion shall NOT

Create Membership

Grant Recognition

Modify RBAC

Enable Public Profile

Assign Membership Number

------------------------------------------------------------
LAYOUT

Identity Completion belongs under

/auth/

using

MinimalLayout

Identity Completion is NOT part of HubLayout.

------------------------------------------------------------
HUB BEHAVIOUR

HubLayout remains the Authentication Owner.

HubLayout additionally validates Identity Status.

New Guard State

Authenticated

+

IDENTITY_PENDING

↓

Redirect

/auth/identity-complete?next=[requested page]

------------------------------------------------------------
ADMINISTRATION

Member Management

Displays

Identity Status

Identity Completed At

Username

Actions

Send Completion Link

Send Priority Completion Link

Resend Welcome Email

Administrators never edit usernames.

------------------------------------------------------------
IDENTITY SERVICE

Single owner

IdentityService

Responsibilities

createIdentity()

completeIdentity()

validateUsername()

reserveUsername()

markIdentityComplete()

isIdentityComplete()

sendCompletionLink()

sendPriorityCompletionLink()

All authentication providers use IdentityService.

------------------------------------------------------------
MIGRATION

Existing users

username NULL

↓

identity_status

↓

IDENTITY_PENDING

Next login

↓

Identity Completion

↓

Continue

No administrator intervention required.

------------------------------------------------------------
END OF DOCUMENT