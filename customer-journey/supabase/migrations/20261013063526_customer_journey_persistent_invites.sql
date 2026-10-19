begin;
alter table public.cj_invites drop constraint if exists cj_invites_type_check;
alter table public.cj_invites add constraint cj_invites_type_check check(type in ('invite','recovery','access'));
-- Existing provider links retain their original type for compatibility with the currently deployed backend. Generate a new invitation after deploying V5.3.4.
commit;
