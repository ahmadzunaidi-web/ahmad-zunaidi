# Customer Journey V5.8.0 — Smart Document Upload (full source)

Based on `Customer-Journey-v5.7.1-FULL-UPLOAD-400-FIX.zip`; matched the October 19 deploy layout for arcustomerjourney. This ZIP is the **complete Netlify project**, not a static drag-and-drop deploy ZIP.

## Scope of fixes

- A successful `document-complete` database commit no longer becomes a false customer-visible upload error when deletion of the previous object or audit logging temporarily fails; safe cleanup remains handled by the orphan-retention job.
- Temporary Storage metadata/read failures in finalization now return HTTP 503 so existing retry logic can continue automatically. Valid MIME and file-header security checks are preserved; no AI, OCR, scanning of payslip contents, or automatic month validation.
- PNG, JPG and WebP photos larger than 3 MiB are resized to <=2400 px and JPEG-compressed in supported browsers *only when resulting file is at least 10% smaller*. PDF and HEIC/HEIF remain untouched. If conversion fails, upload the original file.
- Two concurrent document uploads maximum, remaining items queued. Signed private TUS requests, chunks of 6 MiB, progress bars and resumable retries are retained.
- PWA cache refreshed and CSP hash regenerated. Supabase schema, RLS, review, login, WhatsApp and 21-day retention were not changed.

## Important limitation

The original database and UI still use individual monthly document slots. **A PDF containing six payslips still occupies one slot; the application may still require other monthly slots.** Accepting one combined PDF as satisfying a group requires a separate coordinated UI/SQL migration; none is silently applied by this upload reliability patch.

## Deploy instructions — target Netlify site ONLY

Target site: `arcustomerjourney` / `226c59b6-8796-4de0-847b-080b3ec27c2a`. Supabase project: `ABANG RECOND` (`ldrvvpmxnhapsupdgjee`). **Do not deploy to abangrecond.com or the inactive older Customer Journey site.**

1. Extract this full-source ZIP into a source workspace with Node >=22 and Netlify CLI authenticated to the intended account. Do **not** upload `dist/` or this source ZIP to Netlify Drop; Drop cannot deploy the backend functions from a raw source ZIP.
2. Run `npm ci`, `npm test`, `npm run csp`, `npm run build` and browser QA (`node tests/upload-browser.mjs`) in an environment with dependencies and Chromium. The 12 dependency-free tests listed in the audit have been run here.
3. Deploy to a **preview** using `netlify deploy --build --site 226c59b6-8796-4de0-847b-080b3ec27c2a` (without `--prod`). Retain the existing site-scoped environment variables, auth/session settings and private Storage policies.
4. Smoke-test with an authorized test account: upload JPEG, a 13MB PDF, same slot twice, interrupt/retry, refresh, and confirm admin can download each latest file. Check `/api/cj/document-init`, `/api/cj/document-complete` and Netlify function logs. Confirm 21-day retention worker config remains active.
5. Only after live preview PASS deploy production using `netlify deploy --build --prod --site 226c59b6-8796-4de0-847b-080b3ec27c2a`. Production domain may be proxied at `abangrecond.com/journey`; test both addresses if routed.

## What was NOT done

No live backend, database schema or existing customer records were changed. Netlify connector available to this assistant supports site read/observability, but not deploy or retrieving/editing a hosted function in-place. The full integration and physical-phone QA are NOT verified.

See `AUDIT-SMART-UPLOAD-V5.8.0.md` for PASS/HOLD evidence.
