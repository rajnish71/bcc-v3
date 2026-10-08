import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

// Explicit DTO for POST /api/v1/identity/admin/reconcile-duplicate-identity.
// The actor is never accepted here -- it comes from the authenticated JWT.
// finalEmail, when supplied, must equal duplicateEmail (enforced in the
// service); it exists only to hand the duplicate's freed address to the
// canonical identity, not as a general email-change field.
export class ReconcileDuplicateIdentityDto {
  @IsInt()
  @Min(1)
  canonicalUserId: number;

  @IsInt()
  @Min(1)
  duplicateUserId: number;

  @IsUUID('all')
  duplicateUuid: string;

  @IsEmail()
  @MaxLength(255)
  duplicateEmail: string;

  @IsInt()
  @Min(1)
  authIdentityId: number;

  // Why this duplicate reconciliation is being performed.
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  // The Human Authority's basis for establishing that the authentication-
  // provider account being re-linked belongs to the owner of the canonical
  // identity. Distinct from `reason`; never the provider subject or OAuth data.
  @IsString()
  @Matches(/\S/, { message: 'providerOwnershipAttestation must not be empty or whitespace-only' })
  @MaxLength(500)
  providerOwnershipAttestation: string;

  // Canonical state the operator reviewed (e.g. in the dry run). Compared
  // against the locked canonical row; any drift refuses with 409.
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  expectedCanonicalUsername: string;

  @IsEmail()
  @MaxLength(255)
  expectedCanonicalEmail: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  finalEmail?: string;

  // Required: callers state explicitly whether this run may mutate.
  @IsBoolean()
  dryRun: boolean;
}
