-- V5.2 public generic progress lookup. NO anon access to customer/application tables.
begin;
create table public.cj_tracker_index(case_id uuid primary key references public.cj_cases(id) on delete cascade,ic_hmac text not null check(length(ic_hmac)=64),created_at timestamptz not null default now());
create index cj_tracker_ic on public.cj_tracker_index(ic_hmac,created_at desc);
alter table public.cj_tracker_index enable row level security;
revoke all on public.cj_tracker_index from public,anon,authenticated;
grant all on public.cj_tracker_index to service_role;
commit;
