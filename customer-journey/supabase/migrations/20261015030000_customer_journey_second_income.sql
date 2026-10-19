-- V5.5: optional second income (income2Category + inc2* fields, inc2_* document slots).
-- Additive only: existing applications, documents and the previous frontend keep working unchanged.
create or replace function cj_private.validate_application(a jsonb) returns void language plpgsql set search_path='' as $$begin
if a is null or jsonb_typeof(a)<>'object' then raise exception 'Invalid application';end if;
if a-array['model','year','colour','name','ic','phone','email','category','mailAddress','currentAddress','race','religion','marital','children','home','stayYears','education','mother','spouseName','spouseIc','spouseJob','spouseEmployer','spousePhone','spouseSalary','employer','employerAddress','job','jobStatus','startDate','officePhone','retireAge','hrEmail','refName','refRel','refPhone','income2Category','inc2Employer','inc2EmployerAddress','inc2Job','inc2JobStatus','inc2StartDate','inc2OfficePhone','inc2Income']<>'{}'::jsonb or exists(select 1 from jsonb_each(a) x where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>1500) then raise exception 'Invalid application fields';end if;
if coalesce(a->>'income2Category','') not in ('','government','private','business','other') then raise exception 'Invalid second income category';end if;
end$$;

create or replace function cj_private.apply(cid uuid,a jsonb,notice text) returns void language plpgsql security definer set search_path='' as $$declare c public.cj_cases;cat text:=a->>'category';cat2 text:=coalesce(a->>'income2Category','');slots text[]:=array['icFront','icBack','licenseFront','licenseBack'];i int;begin
perform cj_private.validate_application(a);
select * into c from public.cj_cases where id=cid for update;
if c.id is null or auth.uid() is null or c.customer_id<>auth.uid() then raise exception 'Forbidden';end if;
if coalesce((c.progress->>'submitted')::boolean,false) then raise exception 'Application already submitted';end if;
if notice is distinct from 'privacy-v1' or coalesce(a->>'name','')='' or coalesce(a->>'ic','')!~'^[0-9]{12}$' or coalesce(a->>'phone','')='' or coalesce(nullif(a->>'mailAddress',''),nullif(a->>'currentAddress',''),'')='' then raise exception 'Required applicant fields/consent missing';end if;
if cat='government' then for i in 1..3 loop slots:=array_append(slots,'payslip'||i);end loop;
elsif cat='private' then for i in 1..6 loop slots:=array_append(slots,'payslip'||i);slots:=array_append(slots,'bankstmt'||i);end loop;slots:=array_append(slots,'kwsp');
elsif cat='business' then slots:=array_append(slots,'ssm');for i in 1..6 loop slots:=array_append(slots,'bizbank'||i);end loop;
else raise exception 'Invalid employment category';end if;
if cat2='government' then for i in 1..3 loop slots:=array_append(slots,'inc2_payslip'||i);end loop;
elsif cat2='private' then for i in 1..6 loop slots:=array_append(slots,'inc2_payslip'||i);slots:=array_append(slots,'inc2_bankstmt'||i);end loop;
elsif cat2='business' then slots:=array_append(slots,'inc2_ssm');for i in 1..6 loop slots:=array_append(slots,'inc2_bizbank'||i);end loop;
elsif cat2='other' then for i in 1..6 loop slots:=array_append(slots,'inc2_bankstmt'||i);end loop;
elsif cat2<>'' then raise exception 'Invalid second income category';end if;
if exists(select 1 from unnest(slots) s where not exists(select 1 from public.cj_documents d where d.case_id=cid and d.slot=s and d.scan_status in ('uploaded','clean','pending','error'))) then raise exception 'Required documents missing';end if;
insert into public.cj_applications(case_id,data,notice_version,consent_at)values(cid,a,notice,now())on conflict(case_id)do update set data=excluded.data,notice_version=excluded.notice_version,consent_at=excluded.consent_at,updated_at=now();
update public.cj_cases set progress=progress||'{"submitted":true}'::jsonb where id=cid;
end$$;
