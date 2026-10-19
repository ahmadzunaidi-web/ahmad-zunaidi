-- Customer Journey: active SA may use verified email/password sessions.
create or replace function cj_private.is_staff() returns boolean
language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(
 select 1 from public.cj_staff where user_id=auth.uid() and active
)
$$;
