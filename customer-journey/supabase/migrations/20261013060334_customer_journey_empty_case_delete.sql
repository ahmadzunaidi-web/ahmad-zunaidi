-- Staff-only erasure of untouched invitation placeholders. No existing records are removed by this migration.
begin;
create or replace function cj_private.delete_empty_case(cid uuid,expected integer)
returns void language plpgsql security definer set search_path='' as $$
declare c public.cj_cases;
begin
 if auth.uid() is null or not cj_private.is_staff() then raise exception 'Forbidden';end if;
 select * into c from public.cj_cases where id=cid for update;
 if c.id is null then raise exception 'Rekod tidak dijumpai';end if;
 if expected is null or c.version<>expected then raise exception 'Conflict: rekod berubah. Muat semula dahulu.';end if;
 if c.progress<>'{"decision":"pending","route":"ready"}'::jsonb
 or exists(select 1 from public.cj_applications where case_id=cid)
 or exists(select 1 from public.cj_documents where case_id=cid)
 or exists(select 1 from public.cj_vso where case_id=cid)
 or exists(select 1 from public.cj_banks where case_id=cid)
 or exists(select 1 from public.cj_reviews where case_id=cid)
 then raise exception 'Rekod sudah mempunyai maklumat atau dokumen. Pemadaman rekod kosong tidak dibenarkan.';end if;
 insert into public.cj_audit(actor_id,case_id,action) values(auth.uid(),cid,'empty_case_deleted');
 delete from public.cj_cases where id=cid;
 -- Invite tokens identify the customer, so revoke only when no other case remains.
 if not exists(select 1 from public.cj_cases where customer_id=c.customer_id) then
  update public.cj_invites set used_at=now() where customer_id=c.customer_id and used_at is null;
 end if;
end$$;
revoke all on function cj_private.delete_empty_case(uuid,integer) from public,anon,authenticated;
grant execute on function cj_private.delete_empty_case(uuid,integer) to authenticated;
create or replace function public.cj_delete_empty_case(cid uuid,expected integer)
returns void language sql security invoker set search_path='' as $$select cj_private.delete_empty_case(cid,expected)$$;
revoke all on function public.cj_delete_empty_case(uuid,integer) from public,anon,authenticated;
grant execute on function public.cj_delete_empty_case(uuid,integer) to authenticated;
commit;
