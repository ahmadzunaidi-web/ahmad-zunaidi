-- Additive V5.1; no existing website table, function or policy modified.
begin;
create schema cj_private;
revoke all on schema cj_private from public;
grant usage on schema cj_private to authenticated,service_role;
create table public.cj_staff(user_id uuid primary key references auth.users(id), active boolean not null default true);
alter table public.cj_staff enable row level security;
create policy cj_staff_self on public.cj_staff for select to authenticated using(user_id=(select auth.uid()));
create function cj_private.is_staff() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and auth.jwt()->>'aal'='aal2' and exists(select 1 from public.cj_staff where user_id=auth.uid() and active)$$;
revoke all on function cj_private.is_staff() from public;grant execute on function cj_private.is_staff() to authenticated,service_role;
create table public.cj_cases(id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id), progress jsonb not null default '{"decision":"pending","route":"ready"}', version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index cj_cases_customer on public.cj_cases(customer_id);
create table public.cj_applications(case_id uuid primary key references public.cj_cases(id) on delete cascade, data jsonb not null default '{}', notice_version text, consent_at timestamptz, updated_at timestamptz not null default now());
create table public.cj_vso(case_id uuid primary key references public.cj_cases(id) on delete cascade, data jsonb not null default '{}');
create table public.cj_banks(case_id uuid primary key references public.cj_cases(id) on delete cascade, data jsonb not null default '[]');
create table public.cj_documents(id uuid primary key default gen_random_uuid(),case_id uuid not null references public.cj_cases(id) on delete cascade,slot text not null,path text unique not null,mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),size integer not null check(size>0 and size<=4194304),scan_status text not null default 'pending' check(scan_status in ('pending','clean','infected','error')),created_at timestamptz not null default now(),unique(case_id,slot));
create table public.cj_reviews(case_id uuid primary key references public.cj_cases(id) on delete cascade,rating integer not null check(rating between 1 and 5),review text not null check(length(review) between 10 and 650),feedback text not null default '' check(length(feedback)<=850),public_consent boolean not null default false,consent_version text not null default 'review-v1',consent_at timestamptz,approved boolean not null default false,approved_by uuid references auth.users(id),created_at timestamptz not null default now(),check(not approved or public_consent));
create table public.cj_events(id bigint generated always as identity primary key,case_id uuid references public.cj_cases(id) on delete cascade,actor_id uuid,kind text not null,created_at timestamptz not null default now());
create index cj_events_case on public.cj_events(case_id,created_at);
create table public.cj_push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),endpoint text unique not null,keys jsonb not null,active boolean not null default true,created_at timestamptz not null default now());
create index cj_push_user on public.cj_push_subscriptions(user_id) where active;
create table public.cj_push_queue(id bigint generated always as identity primary key,case_id uuid not null references public.cj_cases(id) on delete cascade,version integer not null,subscription_id uuid not null references public.cj_push_subscriptions(id) on delete cascade,attempts integer not null default 0,status text not null default 'pending' check(status in ('pending','sending','sent','dead')),available_at timestamptz not null default now(),lease_until timestamptz,unique(case_id,version,subscription_id));
create index cj_push_due on public.cj_push_queue(available_at) where status in ('pending','sending');
create table public.cj_audit(id bigint generated always as identity primary key,actor_id uuid,case_id uuid,action text not null,created_at timestamptz not null default now());
create index cj_audit_case on public.cj_audit(case_id,created_at);
-- SELECT only. Mutations run through checked private functions with locked rows.
create function cj_private.can_access(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and (cj_private.is_staff() or exists(select 1 from public.cj_cases where id=cid and customer_id=auth.uid()))$$;
revoke all on function cj_private.can_access(uuid) from public;grant execute on function cj_private.can_access(uuid) to authenticated,service_role;
DO $$declare t text;begin
foreach t in array array['cj_cases','cj_applications','cj_vso','cj_banks','cj_documents','cj_reviews','cj_events','cj_push_subscriptions','cj_push_queue','cj_audit'] loop
execute format('alter table public.%I enable row level security',t);
execute format('revoke all on public.%I from anon,authenticated',t);
execute format('grant select on public.%I to authenticated',t);
execute format('grant all on public.%I to service_role',t);
end loop;end$$;
grant select on public.cj_staff to authenticated;grant all on public.cj_staff to service_role;
create policy cj_cases_read on public.cj_cases for select to authenticated using(customer_id=(select auth.uid()) or cj_private.is_staff());
create policy cj_apps_read on public.cj_applications for select to authenticated using(cj_private.can_access(case_id));
create policy cj_vso_read on public.cj_vso for select to authenticated using(cj_private.is_staff());
create policy cj_banks_read on public.cj_banks for select to authenticated using(cj_private.is_staff());
create policy cj_docs_read on public.cj_documents for select to authenticated using(cj_private.can_access(case_id));
create policy cj_reviews_read on public.cj_reviews for select to authenticated using(cj_private.can_access(case_id));
create policy cj_events_read on public.cj_events for select to authenticated using(cj_private.can_access(case_id));
create policy cj_push_read on public.cj_push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy cj_audit_read on public.cj_audit for select to authenticated using(cj_private.is_staff());
-- Queue has deliberately no authenticated policy.
create function cj_private.guard_progress() returns trigger language plpgsql set search_path='' as $$declare p jsonb:=new.progress; keys text[]:=array['model','year','colour','stock','submitted','vsoReady','bankSubmitted','decision','route','arrivalFrom','arrivalTo','arrived','louSigned','puspakomDate','puspakomDone','pdiDone','touchupDone','registerDate','insuranceDate','deliveryDate','deliveryTime','deliveryPlace','delivered','refunded'];k text;begin
if jsonb_typeof(p)<>'object' or p-keys<>'{}'::jsonb then raise exception 'Unsafe progress field';end if;
foreach k in array array['submitted','vsoReady','bankSubmitted','arrived','puspakomDone','pdiDone','touchupDone','delivered','refunded'] loop
if p?k and jsonb_typeof(p->k)<>'boolean' then raise exception 'Milestone must be boolean';end if;end loop;
if coalesce(p->>'decision','pending') not in ('pending','approved','declined') or coalesce(p->>'route','ready') not in ('ready','arrival') then raise exception 'Invalid decision/route';end if;
if (p->>'vsoReady')::boolean and not coalesce((p->>'submitted')::boolean,false) then raise exception 'Application required';end if;
if (p->>'bankSubmitted')::boolean and not coalesce((p->>'vsoReady')::boolean,false) then raise exception 'VSO required';end if;
if p->>'decision' in ('approved','declined') and not coalesce((p->>'bankSubmitted')::boolean,false) then raise exception 'Bank submission required';end if;
if coalesce(p->>'louSigned','')<>'' and (p->>'decision'<>'approved' or (p->>'route'='arrival' and not coalesce((p->>'arrived')::boolean,false))) then raise exception 'Approval/arrival required before LOU';end if;
if (coalesce(p->>'puspakomDate','')<>'' or coalesce((p->>'puspakomDone')::boolean,false) or coalesce((p->>'pdiDone')::boolean,false) or coalesce((p->>'touchupDone')::boolean,false)) and coalesce(p->>'louSigned','')='' then raise exception 'LOU required';end if;
if (coalesce(p->>'registerDate','')<>'' or coalesce(p->>'insuranceDate','')<>'') and not coalesce((p->>'puspakomDone')::boolean,false) then raise exception 'PUSPAKOM required';end if;
if coalesce(p->>'deliveryDate','')<>'' or coalesce((p->>'delivered')::boolean,false) then
if not(coalesce((p->>'puspakomDone')::boolean,false) and coalesce((p->>'pdiDone')::boolean,false) and coalesce((p->>'touchupDone')::boolean,false) and coalesce(p->>'registerDate','')<>'' and coalesce(p->>'insuranceDate','')<>'') then raise exception 'Delivery prerequisites incomplete';end if;end if;
if coalesce((p->>'delivered')::boolean,false) and (coalesce(p->>'deliveryDate','')='' or coalesce(p->>'deliveryPlace','')='' or coalesce((p->>'refunded')::boolean,false)) then raise exception 'Invalid delivery/refund';end if;
foreach k in array array['arrivalFrom','arrivalTo','louSigned','puspakomDate','registerDate','insuranceDate','deliveryDate'] loop if coalesce(p->>k,'')<>'' then perform (p->>k)::date;end if;end loop;
if coalesce(p->>'arrivalFrom','')<>'' and coalesce(p->>'arrivalTo','')<>'' and (p->>'arrivalFrom')::date>(p->>'arrivalTo')::date then raise exception 'Invalid ETA range';end if;
if tg_op='UPDATE' then new.version:=old.version+1;end if;new.updated_at:=now();return new;end$$;
create trigger cj_guard_progress before insert or update on public.cj_cases for each row execute function cj_private.guard_progress();
create function cj_private.audit_progress() returns trigger language plpgsql security definer set search_path='' as $$begin
if old.progress is distinct from new.progress then
insert into public.cj_events(case_id,actor_id,kind)values(new.id,auth.uid(),'progress_changed');
insert into public.cj_audit(case_id,actor_id,action)values(new.id,auth.uid(),'progress_changed');
-- Only visible milestone changes; no documents, names, notes or bank data in payload.
if (old.progress-array['model','year','colour','stock']) is distinct from (new.progress-array['model','year','colour','stock']) then
insert into public.cj_push_queue(case_id,version,subscription_id) select new.id,new.version,id from public.cj_push_subscriptions where user_id=new.customer_id and active on conflict do nothing;
end if;end if;return new;end$$;
revoke all on function cj_private.audit_progress() from public;
create trigger cj_progress_event after update on public.cj_cases for each row execute function cj_private.audit_progress();
create function cj_private.apply(cid uuid,a jsonb,notice text) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;cat text:=a->>'category';slots text[]:=array['icFront','icBack','licenseFront','licenseBack'];i int;begin
select * into c from public.cj_cases where id=cid for update;
if c.id is null or auth.uid() is null or c.customer_id<>auth.uid() then raise exception 'Forbidden';end if;
if coalesce((c.progress->>'submitted')::boolean,false) then raise exception 'Application already submitted';end if;
if notice<>'privacy-v1' or coalesce(a->>'name','')='' or coalesce(a->>'ic','')!~'^[0-9]{12}$' or coalesce(a->>'phone','')='' or coalesce(nullif(a->>'mailAddress',''),nullif(a->>'currentAddress',''),'')='' then raise exception 'Required applicant fields/consent missing';end if;
if cat='government' then for i in 1..3 loop slots:=array_append(slots,'payslip'||i);end loop;
elsif cat='private' then for i in 1..6 loop slots:=array_append(slots,'payslip'||i);slots:=array_append(slots,'bankstmt'||i);end loop;slots:=array_append(slots,'kwsp');
elsif cat='business' then slots:=array_append(slots,'ssm');for i in 1..6 loop slots:=array_append(slots,'bizbank'||i);end loop;
else raise exception 'Invalid employment category';end if;
if exists(select 1 from unnest(slots) s where not exists(select 1 from public.cj_documents d where d.case_id=cid and d.slot=s and d.scan_status='clean')) then raise exception 'Required documents missing or not scanned';end if;
insert into public.cj_applications(case_id,data,notice_version,consent_at)values(cid,a,notice,now())on conflict(case_id)do update set data=excluded.data,notice_version=excluded.notice_version,consent_at=excluded.consent_at,updated_at=now();
update public.cj_cases set progress=progress||'{"submitted":true}'::jsonb where id=cid;
end$$;
create function public.cj_apply(cid uuid,a jsonb,notice text) returns void language sql security invoker set search_path='' as $$select cj_private.apply(cid,a,notice)$$;
create function cj_private.save(cid uuid,expected integer,p jsonb,v jsonb,b jsonb) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;begin
if not cj_private.is_staff() then raise exception 'Forbidden';end if;
select * into c from public.cj_cases where id=cid for update;if c.id is null or c.version<>expected then raise exception 'Conflict: reload current case';end if;
if p->>'submitted' is distinct from c.progress->>'submitted' then raise exception 'Submission cannot be overridden';end if;
if coalesce((p->>'vsoReady')::boolean,false) and (coalesce(v->>'dealer','')='' or coalesce(v->>'model','')='' or coalesce(v->>'carPrice','')='' or coalesce(v->>'loanAmount','')='') then raise exception 'Complete VSO required';end if;
if jsonb_typeof(b)<>'array' then raise exception 'Invalid banks';end if;
if coalesce((p->>'bankSubmitted')::boolean,false) is distinct from (jsonb_array_length(b)>0) then raise exception 'Bank submissions mismatch';end if;
insert into public.cj_vso values(cid,v)on conflict(case_id)do update set data=excluded.data;
insert into public.cj_banks values(cid,b)on conflict(case_id)do update set data=excluded.data;
update public.cj_cases set progress=p where id=cid;
insert into public.cj_audit(actor_id,case_id,action)values(auth.uid(),cid,'staff_save');end$$;
create function public.cj_save(cid uuid,expected integer,p jsonb,v jsonb,b jsonb) returns void language sql security invoker set search_path='' as $$select cj_private.save(cid,expected,p,v,b)$$;
create function cj_private.review(cid uuid,stars integer,txt text,private_feedback text,consent boolean) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;begin
select * into c from public.cj_cases where id=cid for update;
if auth.uid() is null or c.id is null or c.customer_id<>auth.uid() or not coalesce((c.progress->>'delivered')::boolean,false) then raise exception 'Forbidden: delivery required';end if;
insert into public.cj_reviews(case_id,rating,review,feedback,public_consent,consent_at) values(cid,stars,txt,private_feedback,consent,case when consent then now() else null end);
insert into public.cj_audit(actor_id,case_id,action)values(auth.uid(),cid,'review_submitted');end$$;
create function public.cj_review(cid uuid,stars integer,txt text,private_feedback text,consent boolean) returns void language sql security invoker set search_path='' as $$select cj_private.review(cid,stars,txt,private_feedback,consent)$$;
create function cj_private.moderate(cid uuid,approve boolean) returns void language plpgsql security definer set search_path='' as $$begin
if not cj_private.is_staff() then raise exception 'Forbidden';end if;
update public.cj_reviews set approved=approve,approved_by=case when approve then auth.uid() else null end where case_id=cid and (not approve or public_consent);
if not found then raise exception 'Review missing or no consent';end if;
insert into public.cj_audit(actor_id,case_id,action)values(auth.uid(),cid,case when approve then 'review_approved' else 'review_unpublished' end);end$$;
create function public.cj_moderate(cid uuid,approve boolean) returns void language sql security invoker set search_path='' as $$select cj_private.moderate(cid,approve)$$;
create function cj_private.withdraw(cid uuid) returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null or not exists(select 1 from public.cj_cases where id=cid and customer_id=auth.uid()) then raise exception 'Forbidden';end if;
update public.cj_reviews set public_consent=false,approved=false,approved_by=null where case_id=cid;
insert into public.cj_audit(actor_id,case_id,action)values(auth.uid(),cid,'consent_withdrawn');end$$;
create function public.cj_withdraw(cid uuid) returns void language sql security invoker set search_path='' as $$select cj_private.withdraw(cid)$$;
create function cj_private.subscribe(ep text,k jsonb,enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'Forbidden';end if;
if enabled then
if length(ep)>2048 or ep!~'^https://' then raise exception 'Invalid endpoint';end if;
insert into public.cj_push_subscriptions(user_id,endpoint,keys,active)values(auth.uid(),ep,k,true)on conflict(endpoint)do update set user_id=excluded.user_id,keys=excluded.keys,active=true;
else update public.cj_push_subscriptions set active=false where user_id=auth.uid();end if;
insert into public.cj_audit(actor_id,action)values(auth.uid(),case when enabled then 'push_enabled' else 'push_disabled' end);end$$;
create function public.cj_subscribe(ep text,k jsonb,enabled boolean) returns void language sql security invoker set search_path='' as $$select cj_private.subscribe(ep,k,enabled)$$;
-- Public feed is accessed only server-side; direct anon gets no table access.
create view public.cj_public_reviews with(security_invoker=true) as select r.rating,r.review,c.progress->>'model' vehicle_model,'Pelanggan Abang Recond'::text display_name,r.created_at reviewed_at from public.cj_reviews r join public.cj_cases c on c.id=r.case_id where r.public_consent and r.approved and coalesce((c.progress->>'delivered')::boolean,false);
revoke all on public.cj_public_reviews from public,anon,authenticated;grant select on public.cj_public_reviews to service_role;
create function public.cj_claim_push(batch integer default 20) returns setof public.cj_push_queue language sql security invoker set search_path='' as $$update public.cj_push_queue set status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' where id in (select id from public.cj_push_queue where (status='pending' and available_at<=now()) or(status='sending' and lease_until<now()) order by id for update skip locked limit least(greatest(batch,1),20)) returning *$$;
revoke all on function public.cj_claim_push(integer) from public,anon,authenticated;grant execute on function public.cj_claim_push(integer) to service_role;
DO $$declare r record;begin
for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='cj_private' and p.proname in ('apply','save','review','moderate','withdraw','subscribe') loop execute format('revoke all on function %s from public',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;
for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname in ('cj_apply','cj_save','cj_review','cj_moderate','cj_withdraw','cj_subscribe') loop execute format('revoke all on function %s from public,anon',r.sig);execute format('grant execute on function %s to authenticated',r.sig);end loop;end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('cj-documents','cj-documents',false,4194304,array['application/pdf','image/jpeg','image/png']);
-- No browser storage permissions: upload/download/sign/delete through authenticated BFF.
-- Explicit restrictive policy also protects this bucket from future broad storage policies.
create policy cj_storage_deny_direct on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'cj-documents') with check(bucket_id<>'cj-documents');
create table public.cj_rate_limits(key text primary key,window_at timestamptz not null default now(),count integer not null default 1);
alter table public.cj_rate_limits enable row level security;
revoke all on public.cj_rate_limits from public,anon,authenticated;
grant all on public.cj_rate_limits to service_role;
create function public.cj_take_limit(key text,max_count int) returns boolean language sql security invoker set search_path='' as $$
insert into public.cj_rate_limits as r(key)values(key) on conflict(key)do update set count=case when r.window_at<now()-interval '1 minute' then 1 else r.count+1 end,window_at=case when r.window_at<now()-interval '1 minute' then now() else r.window_at end returning count<=max_count
$$;
revoke all on function public.cj_take_limit(text,int) from public,anon,authenticated;grant execute on function public.cj_take_limit(text,int) to service_role;

create function cj_private.draft(cid uuid,a jsonb) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;begin
select * into c from public.cj_cases where id=cid for update;
if auth.uid() is null or c.id is null or c.customer_id<>auth.uid() then raise exception 'Forbidden';end if;
if coalesce((c.progress->>'submitted')::boolean,false) then raise exception 'Application already submitted';end if;
if jsonb_typeof(a)<>'object' or length(a::text)>60000 then raise exception 'Invalid application draft';end if;
insert into public.cj_applications(case_id,data)values(cid,a)on conflict(case_id)do update set data=excluded.data,updated_at=now();end$$;
create function public.cj_draft(cid uuid,a jsonb) returns void language sql security invoker set search_path='' as $$select cj_private.draft(cid,a)$$;
revoke all on function cj_private.draft(uuid,jsonb) from public;grant execute on function cj_private.draft(uuid,jsonb) to authenticated;
revoke all on function public.cj_draft(uuid,jsonb) from public,anon;grant execute on function public.cj_draft(uuid,jsonb) to authenticated;

grant usage,select on sequence public.cj_events_id_seq,public.cj_audit_id_seq,public.cj_push_queue_id_seq to service_role;
create table public.cj_invites(token_hash text primary key,customer_id uuid not null references auth.users(id),type text not null check(type in ('invite','recovery')),expires_at timestamptz not null,used_at timestamptz);
alter table public.cj_invites enable row level security;
revoke all on public.cj_invites from public,anon,authenticated;grant all on public.cj_invites to service_role;
create index cj_invites_expiry on public.cj_invites(expires_at);
commit;
