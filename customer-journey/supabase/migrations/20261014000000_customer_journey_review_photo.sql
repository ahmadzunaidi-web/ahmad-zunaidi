-- V5.4: optional single photo per post-delivery review. Additive only.
-- Photo objects live in the private cj-documents bucket under reviews/<case_id>/; only the server (service role) writes them.
alter table public.cj_reviews add column if not exists photo_path text check (photo_path is null or photo_path ~ '^reviews/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
create or replace view public.cj_public_reviews with(security_invoker=true) as
select r.rating,r.review,c.progress->>'model' vehicle_model,'Pelanggan Abang Recond'::text display_name,r.created_at reviewed_at,r.photo_path
from public.cj_reviews r join public.cj_cases c on c.id=r.case_id
where r.public_consent and r.approved and coalesce((c.progress->>'delivered')::boolean,false);
revoke all on public.cj_public_reviews from public,anon,authenticated;
grant select on public.cj_public_reviews to service_role;
