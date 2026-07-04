-- Seed 0006: Batch 4 permissions (voting register + membership card)
--
-- MEM-006 §02.11: Voting register generation is a coordinator/admin action.
-- MEM-006 §02.7:  Membership card is accessible by the member themselves
--                 and by staff with the generate permission.

INSERT IGNORE INTO permissions (permission_key, description) VALUES
  ('membership.voting_register.generate',
   'Generate a new AGM voting register snapshot'),
  ('membership.voting_register.view',
   'View existing voting register snapshots'),
  ('membership.card.generate',
   'Generate a digital membership card for any member (self always permitted)');
