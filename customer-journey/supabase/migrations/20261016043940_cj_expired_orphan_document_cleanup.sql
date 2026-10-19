create or replace function public.cj_expired_orphan_documents() returns table(path text) language sql security invoker set search_path='' as $$
 select o.name from storage.objects o where o.bucket_id='cj-documents' and o.created_at < now()-interval '21 days'
 and o.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}$'
 and not exists(select 1 from public.cj_documents d where d.path=o.name)
 order by o.created_at limit 30;
$$;
revoke all on function public.cj_expired_orphan_documents() from public,anon,authenticated;
grant execute on function public.cj_expired_orphan_documents() to service_role;
