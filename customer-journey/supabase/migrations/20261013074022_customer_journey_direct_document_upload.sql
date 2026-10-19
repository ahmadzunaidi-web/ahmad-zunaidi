begin;
alter table public.cj_documents drop constraint if exists cj_documents_scan_status_check;
alter table public.cj_documents add constraint cj_documents_scan_status_check check(scan_status in ('uploaded','pending','clean','infected','error'));
alter table public.cj_documents alter column scan_status set default 'uploaded';
update public.cj_documents set scan_status='uploaded',scan_lease_until=null where scan_status in ('pending','error');
-- Disable the old deployed scanner during rollout, without granting customer access.
create or replace function public.cj_claim_documents(batch integer default 3) returns setof public.cj_documents language sql security invoker set search_path='' as $$select * from public.cj_documents where false$$;
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
if exists(select 1 from unnest(slots) s where not exists(select 1 from public.cj_documents d where d.case_id=cid and d.slot=s and d.scan_status in ('uploaded','clean','pending','error'))) then raise exception 'Required documents missing';end if;
insert into public.cj_applications(case_id,data,notice_version,consent_at)values(cid,a,notice,now())on conflict(case_id)do update set data=excluded.data,notice_version=excluded.notice_version,consent_at=excluded.consent_at,updated_at=now();
update public.cj_cases set progress=progress||'{"submitted":true}'::jsonb where id=cid;
end$$;
commit;
