-- Migration 0029: Membership Card Verify Token
--
-- Adds an unguessable opaque token to each membership row used as the
-- target of QR-code verification on digital membership cards.
--
-- SECURITY NOTE (MEM-007): QR codes encode /verify/{token}, NOT
-- /verify/{membership_number}. membership_number values (format
-- BCC+YYYY+MM+5-digit-serial) are sequential and enumerable and must
-- never appear in a public URL that discloses membership existence or
-- cardholder identity.
--
-- The token is NULL until the first card is generated for that
-- membership. Once set it is permanent; a new token can only be issued
-- by an admin invalidating and regenerating the card.

ALTER TABLE memberships
  ADD COLUMN card_verify_token VARCHAR(22) NULL
    COMMENT '22-char base64url opaque slug; NULL until first card request; QR /verify/{token}',
  ADD UNIQUE INDEX uq_memberships_card_verify_token (card_verify_token);
