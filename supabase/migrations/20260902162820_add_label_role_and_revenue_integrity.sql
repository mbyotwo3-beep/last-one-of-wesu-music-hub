-- `label` is a first-class application role. This must remain in its own
-- migration because PostgreSQL does not allow a newly added enum value to be
-- used until the transaction that adds it has committed.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'label';
