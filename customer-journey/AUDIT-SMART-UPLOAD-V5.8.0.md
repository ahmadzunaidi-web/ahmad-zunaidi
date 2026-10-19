# Customer Journey — Smart Document Upload V5.8.0 — Audit & Handover

**Date:** 19 October 2026 (MYT)  
**Baseline:** Customer Journey V5.7.1 full source, Library 16 October 2026  
**Target:** Netlify `arcustomerjourney` (site ID `226c59b6-8796-4de0-847b-080b3ec27c2a`) + Supabase `ABANG RECOND` (`ldrvvpmxnhapsupdgjee`)  
**Status:** SOURCE PATCH READY · PRODUCTION HOLD

## Findings

- Public site browser uses a Netlify BFF `/api/cj/document-init` and `document-complete`, scoped Supabase TUS signed upload token, 6 MiB chunks and manual document status refresh. The uploaded deploy ZIP had public assets, not BFF source; V5.7.1 Full Source was recovered from authorized Library.
- Supabase private bucket `cj-documents` exists, MIME allowlist PDF/JPEG/PNG/WebP/HEIC/HEIF, bucket-specific max `null` (provider/project limits still apply).
- Database `cj_documents`: 48 metadata entries across 4 cases, all `scan_status=uploaded` as of audit; no customer data was read into this report. Existing unique `(case_id,slot)` and `(path)` indexes; no index change required.
- Old Netlify backend, after successfully committing the new document metadata, awaited deleting the previous object and an audit log. A temporary error could falsely report upload failed although the document was saved. This was fixed by treating cleanup/audit as best-effort *after* commit; orphan retention continues to reconcile unused objects.
- Transient Storage info/read failures were treated like generic HTTP 400 and not auto-retried by the frontend. They are now HTTP 503 with a generic retryable message.
- Large photos previously uploaded at original size and customer uploads were strictly sequential.

## Changes

`server/api.mjs`, new `server/upload-postcommit.mjs`, `public/index.html`, `public/sw.js`, CSP `netlify.toml`, `package.json`, README, new targeted test suite.

- **Unchanged**: direct signed TUS security, private bucket/RLS, 21-day deletion code and schedule, bank VSO, login/session/role rules, WhatsApp, reviews and push logic.
- **No AI/OCR/month extraction**: basic MIME/file signature safety validation remains by design. The salesman reviews actual documents manually.

## Tests in this runtime

**PASS: 12/12** dependency-free Node tests: four TUS client tests, five targeted post-commit/compression/concurrency tests and three PWA/income compatibility tests. `node --check server/api.mjs` PASS. CSP hashes regenerated; `node scripts/build.mjs` PASS; root/journey static copies regenerated.

**NOT VERIFIED**: complete `npm test` (package install required; outbound npm package retrieval timed out), Chromium full browser suite, live Netlify API/Storage uploads, physical mobile, Netlify preview and production rollout. Previous V5.7.1 browser QA used a mocked API and cannot be claimed as live evidence.

## Risk/remaining work

1. Monthly payslip/bank statement slots are still the original format. One multi-month PDF occupies one slot; no silent change was made to SQL submit gates. A future group-upload redesign must change the frontend, document grouping, and `cj_apply` database eligibility together.
2. Scanner/AI content examination was not introduced; only file safety and MIME checks run.
3. A post-commit audit log can be missed during a temporary audit outage; the API now logs a generic warning and does not falsely tell the customer the upload failed. For formal audit guarantees consider database-triggered transactional outbox later.
4. Netlify deploy must include `netlify/functions/cj-api.mts`, not just `dist`. Keep production on HOLD until preview and authenticated live uploads pass.

## No changes made live

All Supabase operations in this audit were read-only. No existing customer documents were replaced, deleted or reclassified. The deployment was not performed because the authorized Netlify connector has **read/observability** but no code-deploy operation.
