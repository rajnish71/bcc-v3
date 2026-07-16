// backend/src/modules/shared/phone.util.ts
//
// Canonical phone utilities for BCC Unified Platform.
//
// Storage contract: Indian mobile numbers are stored as exactly 10 digits
// (XXXXXXXXXX). The +91 country code is never stored — it is generated only
// at the communication boundary when calling MSG91, WhatsApp, or SMS providers.
//
// Accepted input formats (all normalize to the same canonical form):
//   XXXXXXXXXX          — already canonical
//   +91XXXXXXXXXX       — E164 with plus
//   91XXXXXXXXXX        — 12-digit digits-only (country code, no plus)
//   0XXXXXXXXXX         — local trunk prefix
//   +91 XXXXX XXXXX     — E164 with spaces / hyphens / parentheses (stripped)
//
// Validation: canonical form must satisfy ^[6-9]\d{9}$
// (Indian mobile allocations use 6–9 as the first digit)
//
// Usage pattern in every service write path:
//   const canonical = normalize(dto.phone);
//   if (!validate(canonical)) throw new BadRequestException('Invalid Indian mobile number');
//   // ... then store canonical

export function normalize(input: string): string {
  // Strip every character that is not a digit
  const digits = input.replace(/\D/g, '');

  // 12-digit string starting with 91 → strip the E164 country code
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }

  // 11-digit string starting with 0 → strip the local trunk prefix
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  // Already 10 digits (canonical) or unrecognized format (validate will reject)
  return digits;
}

// Validates a normalized phone number.
// ALWAYS call normalize() first. Calling validate() on raw user input is wrong.
export function validate(normalized: string): boolean {
  return /^[6-9]\d{9}$/.test(normalized);
}

// Produces the E164 form required by external messaging providers.
// Called ONLY at the communication boundary — never before a DB write.
export function toE164(normalized: string): string {
  return `+91${normalized}`;
}

// Produces a human-readable display form for UI and notification templates.
// Never stored.
export function toDisplay(normalized: string): string {
  return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
}
