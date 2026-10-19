alter table public.cj_documents drop constraint cj_documents_size_check;
alter table public.cj_documents alter column size type bigint;
alter table public.cj_documents add constraint cj_documents_size_check check(size>0);
alter table public.cj_documents drop constraint cj_documents_mime_check;
alter table public.cj_documents add constraint cj_documents_mime_check check(mime in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'));
update storage.buckets set file_size_limit=null,allowed_mime_types=array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'] where id='cj-documents';
