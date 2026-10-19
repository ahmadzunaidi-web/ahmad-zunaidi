-- V5.3.1 audit fixes. Only Customer Journey functions; no legacy production changes.
begin;
create function cj_private.validate_application(a jsonb) returns void language plpgsql set search_path='' as $$begin
if a is null or jsonb_typeof(a)<>'object' then raise exception 'Invalid application';end if;
if a-array['model','year','colour','name','ic','phone','email','category','mailAddress','currentAddress','race','religion','marital','children','home','stayYears','education','mother','spouseName','spouseIc','spouseJob','spouseEmployer','spousePhone','spouseSalary','employer','employerAddress','job','jobStatus','startDate','officePhone','retireAge','hrEmail','refName','refRel','refPhone']<>'{}'::jsonb or exists(select 1 from jsonb_each(a) x where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>1500) then raise exception 'Invalid application fields';end if;
end$$;
revoke all on function cj_private.validate_application(jsonb) from public;
grant execute on function cj_private.validate_application(jsonb) to authenticated;
create or replace function cj_private.apply(cid uuid,a jsonb,notice text) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;cat text:=a->>'category';slots text[]:=array['icFront','icBack','licenseFront','licenseBack'];i int;begin
perform cj_private.validate_application(a);
select * into c from public.cj_cases where id=cid for update;
if c.id is null or auth.uid() is null or c.customer_id<>auth.uid() then raise exception 'Forbidden';end if;
if coalesce((c.progress->>'submitted')::boolean,false) then raise exception 'Application already submitted';end if;
if notice is distinct from 'privacy-v1' or coalesce(a->>'name','')='' or coalesce(a->>'ic','')!~'^[0-9]{12}$' or coalesce(a->>'phone','')='' or coalesce(nullif(a->>'mailAddress',''),nullif(a->>'currentAddress',''),'')='' then raise exception 'Required applicant fields/consent missing';end if;
if cat='government' then for i in 1..3 loop slots:=array_append(slots,'payslip'||i);end loop;
elsif cat='private' then for i in 1..6 loop slots:=array_append(slots,'payslip'||i);slots:=array_append(slots,'bankstmt'||i);end loop;slots:=array_append(slots,'kwsp');
elsif cat='business' then slots:=array_append(slots,'ssm');for i in 1..6 loop slots:=array_append(slots,'bizbank'||i);end loop;
else raise exception 'Invalid employment category';end if;
if exists(select 1 from unnest(slots) s where not exists(select 1 from public.cj_documents d where d.case_id=cid and d.slot=s and d.scan_status='clean')) then raise exception 'Required documents missing or not scanned';end if;
insert into public.cj_applications(case_id,data,notice_version,consent_at)values(cid,a,notice,now())on conflict(case_id)do update set data=excluded.data,notice_version=excluded.notice_version,consent_at=excluded.consent_at,updated_at=now();
update public.cj_cases set progress=progress||'{"submitted":true}'::jsonb where id=cid;
end$$;
create or replace function cj_private.draft(cid uuid,a jsonb) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;begin
perform cj_private.validate_application(a);
select * into c from public.cj_cases where id=cid for update;
if auth.uid() is null or c.id is null or c.customer_id<>auth.uid() then raise exception 'Forbidden';end if;
if coalesce((c.progress->>'submitted')::boolean,false) then raise exception 'Application already submitted';end if;
if jsonb_typeof(a)<>'object' or length(a::text)>60000 then raise exception 'Invalid application draft';end if;
insert into public.cj_applications(case_id,data)values(cid,a)on conflict(case_id)do update set data=excluded.data,updated_at=now();end$$;
create or replace function cj_private.save(cid uuid,expected integer,p jsonb,v jsonb,b jsonb) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;begin
if not cj_private.is_staff() then raise exception 'Forbidden';end if;
select * into c from public.cj_cases where id=cid for update;if c.id is null or expected is null or c.version<>expected then raise exception 'Conflict: reload current case';end if;
if p->>'submitted' is distinct from c.progress->>'submitted' then raise exception 'Submission cannot be overridden';end if;
if coalesce((p->>'vsoReady')::boolean,false) and (coalesce(v->>'dealer','')='' or coalesce(v->>'model','')='' or coalesce(v->>'carPrice','')='' or coalesce(v->>'loanAmount','')='') then raise exception 'Complete VSO required';end if;
if jsonb_typeof(b)<>'array' then raise exception 'Invalid banks';end if;
if coalesce((p->>'bankSubmitted')::boolean,false) is distinct from (jsonb_array_length(b)>0) then raise exception 'Bank submissions mismatch';end if;
insert into public.cj_vso values(cid,v)on conflict(case_id)do update set data=excluded.data;
insert into public.cj_banks values(cid,b)on conflict(case_id)do update set data=excluded.data;
update public.cj_cases set progress=p where id=cid;
insert into public.cj_audit(actor_id,case_id,action)values(auth.uid(),cid,'staff_save');end$$;
create or replace function cj_private.guard_progress() returns trigger language plpgsql set search_path='' as $$declare p jsonb:=new.progress; keys text[]:=array['model','year','colour','stock','submitted','vsoReady','bankSubmitted','decision','route','arrivalFrom','arrivalTo','arrived','louSigned','puspakomDate','puspakomDone','pdiDone','touchupDone','registerDate','insuranceDate','deliveryDate','deliveryTime','deliveryPlace','delivered','refunded'];k text;begin
if jsonb_typeof(p)<>'object' or p-keys<>'{}'::jsonb then raise exception 'Unsafe progress field';end if;
foreach k in array array['submitted','vsoReady','bankSubmitted','arrived','puspakomDone','pdiDone','touchupDone','delivered','refunded'] loop
if p?k and jsonb_typeof(p->k)<>'boolean' then raise exception 'Milestone must be boolean';end if;end loop;
if coalesce(p->>'decision','pending') not in ('pending','approved','declined') or coalesce(p->>'route','ready') not in ('ready','arrival') then raise exception 'Invalid decision/route';end if;
if (p->>'vsoReady')::boolean and not coalesce((p->>'submitted')::boolean,false) then raise exception 'Application required';end if;
if (p->>'bankSubmitted')::boolean and not coalesce((p->>'vsoReady')::boolean,false) then raise exception 'VSO required';end if;
if p->>'decision' in ('approved','declined') and not coalesce((p->>'bankSubmitted')::boolean,false) then raise exception 'Bank submission required';end if;
if coalesce(p->>'louSigned','')<>'' and (coalesce(p->>'decision','pending')<>'approved' or (p->>'route'='arrival' and not coalesce((p->>'arrived')::boolean,false))) then raise exception 'Approval/arrival required before LOU';end if;
if (coalesce(p->>'puspakomDate','')<>'' or coalesce((p->>'puspakomDone')::boolean,false) or coalesce((p->>'pdiDone')::boolean,false) or coalesce((p->>'touchupDone')::boolean,false)) and coalesce(p->>'louSigned','')='' then raise exception 'LOU required';end if;
if (coalesce(p->>'registerDate','')<>'' or coalesce(p->>'insuranceDate','')<>'') and not coalesce((p->>'puspakomDone')::boolean,false) then raise exception 'PUSPAKOM required';end if;
if coalesce(p->>'deliveryDate','')<>'' or coalesce((p->>'delivered')::boolean,false) then
if not(coalesce((p->>'puspakomDone')::boolean,false) and coalesce((p->>'pdiDone')::boolean,false) and coalesce((p->>'touchupDone')::boolean,false) and coalesce(p->>'registerDate','')<>'' and coalesce(p->>'insuranceDate','')<>'') then raise exception 'Delivery prerequisites incomplete';end if;end if;
if coalesce((p->>'delivered')::boolean,false) and (coalesce(p->>'deliveryDate','')='' or coalesce(p->>'deliveryPlace','')='' or coalesce((p->>'refunded')::boolean,false)) then raise exception 'Invalid delivery/refund';end if;
foreach k in array array['arrivalFrom','arrivalTo','louSigned','puspakomDate','registerDate','insuranceDate','deliveryDate'] loop if coalesce(p->>k,'')<>'' then perform (p->>k)::date;end if;end loop;
if coalesce(p->>'arrivalFrom','')<>'' and coalesce(p->>'arrivalTo','')<>'' and (p->>'arrivalFrom')::date>(p->>'arrivalTo')::date then raise exception 'Invalid ETA range';end if;
if tg_op='UPDATE' then new.version:=old.version+1;end if;new.updated_at:=now();return new;end$$;

-- Lease scans to prevent overlapping workers and retry starvation.
alter table public.cj_documents add column scan_attempts integer not null default 0,
 add column scan_available_at timestamptz not null default now(),
 add column scan_lease_until timestamptz;
create index cj_documents_scan_due on public.cj_documents(scan_available_at) where scan_status='pending';
create function public.cj_claim_documents(batch integer default 3) returns setof public.cj_documents language sql security invoker set search_path='' as $$
update public.cj_documents set scan_attempts=scan_attempts+1,scan_lease_until=now()+interval '2 minutes'
where id in(select id from public.cj_documents where scan_status='pending' and scan_available_at<=now() and (scan_lease_until is null or scan_lease_until<now()) order by scan_available_at,created_at for update skip locked limit least(greatest(batch,1),3)) returning *
$$;
revoke all on function public.cj_claim_documents(integer) from public,anon,authenticated;
grant execute on function public.cj_claim_documents(integer) to service_role;
commit;
