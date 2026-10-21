# JANAVI Standalone Readiness Report

Date: 2026-10-16 · Verification state: `tsc --noEmit` **0 errors** · `next build` **✓ (86/86 pages)** · production server boots and serves public pages.

## Executive summary

JANAVI is now an independent, self-hosted application:

- **Zero proprietary dependencies.** `ee/` and `app/(ee)/` (Papermark Commercial License) are deleted from the tree; `grep` finds no imports of them anywhere. All 44 never-committed enterprise modules plus 5 non-ee never-committed modules have JANAVI-owned replacements or were removed with their feature.
- **Zero billing.** No Stripe (dependency uninstalled), no plans/entitlements (`lib/janavi/plan.ts` — single tier, everything enabled), no trial/upgrade/premium UI, no limits engine (`lib/janavi/limits.ts` keeps technical caps only), no paused-team states (`lib/janavi/team-state.ts`).
- **JANAVI branding** across auth pages, metadata, emails, viewer chrome, locales, middleware headers, README. Legal attribution preserved (LICENSE, AGPL, CLA.md, fork credit in README).
- **Cloud infra** wired: RDS `janavi_dev` (env composition + SSL verify-full), Redis Cloud (`janavi:dev:` prefix, dual-transport facade), Beacon email (central `sendEmail` dispatch).

## Feature status

| Feature | Status | Source files | Test coverage | Known limitations |
|---|---|---|---|---|
| Secure document sharing (upload/links/viewing) | ✅ working (pre-existing AGPL core, untouched) | `lib/api/documents/*`, `pages/view/**`, `/api/views*` | typecheck+build+smoke (login/register/view/dashboard redirect) | DB-dependent flows need `.env` (see below) |
| Link access controls: password, email gate, email OTP, expiration, revocation, allow/deny lists | ✅ working (server-enforced, pre-existing) | `app/api/views/route.ts`, `views-dataroom`, `lib/auth/*` | build + code-path review | max-view-count not present (Phase 5 backlog) |
| Download blocking (server-enforced) | ✅ working | `pages/api/links/download/**` | build | — |
| Dynamic watermark (viewing overlay + server burn-in on PDF/image download) | ✅ working | `components/view/watermark-svg.tsx`, `lib/utils/watermark-pdf.ts` | build | not applied to sheet/html/notion types |
| Branding (per-team white-label, multi-brand, dataroom brands) | ✅ reimplemented independently | `lib/branding/*` (14 modules), `components/branding/*` (8) | typecheck; UI smoke pending `.env` | auto-fill scrapes untested live |
| Data rooms (folders, docs, groups, permission groups, bulk download) | ✅ working | AGPL core + `lib/dataroom/apply-default-permissions.ts` (new) | typecheck+build | invitation emails removed (out of scope) |
| Data room analytics | ✅ reimplemented (JANAVI page) | `pages/datarooms/[id]/analytics/index.tsx` | build | page-level analytics = Phase 11 |
| Document analytics (views, durations, CSV export) | ✅ working (pre-existing Tinybird pipeline) | `lib/tinybird/*`, `lib/tracking/*` | build | needs TINYBIRD_TOKEN configured |
| Confidential view (blur-until-hover) | ✅ reimplemented (P0 subset) | `components/view/confidential/*` | typecheck+build | full Protected Viewer is P1 |
| Email (all transactional senders) | ✅ Beacon dispatch | `lib/resend.ts`, `lib/emails/beacon.ts` | runtime-tested with mock Beacon (payload, retries, headers) | Beacon contract assumed standard shape — mapping isolated in `buildBeaconPayload`; contacts subscribe stays on Resend |
| Redis (sessions, locks, job stores, rate limits) | ✅ dual-transport | `lib/redis.ts`, `lib/janavi/redis.ts` | adapter runtime tests (stub + unreachable-server fail-open) | edge middleware cannot reach Redis Cloud (RESP/ioredis is Node-only) → per-domain root redirect override always uses fallback URL; documented in `lib/middleware/domain.ts` |
| PostgreSQL (RDS janavi_dev) | ✅ env composition | `lib/janavi/db-env.ts`, `lib/prisma.ts` | composition unit-tested (SSL modes, encoding, idempotency) | live connectivity untested (no `.env` present) |
| Document conversion (DOCX/PPTX/TXT→PDF) | 🟡 implemented, OFF | `lib/trigger/convert-files.ts` (LibreOffice soffice), gating in `lib/api/documents/process-document.ts` | code-complete; NOT tested end-to-end → `JANAVI_FEATURES.documentConversions = false` until validated with soffice | requires LibreOffice on the worker host (`JANAVI_CONVERSION_SOFFICE`); Keynote best-effort |
| Q&A / conversations | 🔴 isolated, OFF | `components/conversations/viewer/conversation-sidebar-provider.tsx` (provider works, renders nothing), `pages/api/teams/[teamId]/datarooms/[id]/questions/**` (basic API, flag-gated 501) | build | full Q&A = P2; flag false |
| Request lists | 🔴 partial, OFF | `lib/request-lists/{assignments,events}.ts` (upload-auth logic implemented for tus-viewer), UI mounts hidden | typecheck | full workflow = P2; flag false |
| Redaction (permanent removal) | 🔴 removed from UI, flag OFF | mounts deleted from `pages/documents/**`, `document-header.tsx` | n/a | P2 — must use mupdf applyRedactions; will not ship as overlay-only |
| Screen Shield / print/copy restrictions / AI policy | 🔴 not started (P1/P2 per roadmap) | `config/features.ts` records intent | n/a | — |
| Passkey login | ✅ optional | `lib/hanko.ts` (now lazy) | build boots without Hanko env | requires HANKO env to enable |
| Slack notifications | ✅ optional (now lazy) | `lib/integrations/slack/*` | build boots without Slack env | requires SLACK env to enable |
| SAML SSO, SCIM, workflows, dataroom templates/freeze, AI chat, viewer invitations, partner program | ✂️ removed (commercial or out of scope) | — | — | extension points documented (`lib/auth/auth-options.ts` comment); partners pages deleted |

## Verification performed

1. `npx tsc --noEmit` → **0 errors** (from a baseline of 218+).
2. `npm run build` → ✓ compiled, 86/86 static pages, full route manifest.
3. Production server smoke (`PORT=3100 npm run start`, no `.env`):
   - `/login` → 200, `<title>Login | JANAVI</title>`, JANAVI copy + `janavi-logo.svg` (200, image/svg+xml)
   - `/register` → 200 (public self-hosted signup — middleware allowlist fixed; upstream redirected logged-out users to /login because signup lived on the marketing site)
   - `/dashboard` → 307 → `/login?next=%2Fdashboard` (auth gate ✓)
   - `/view/<unknown>` → 200 (viewer ISR fallback page ✓)
   - `/api/health` → 500 with Prisma "POSTGRES_PRISMA_URL not set" — the correct unconfigured state; resolves once `.env` exists
   - Redis/QStash/Hanko/Slack unconfigured → graceful console notices, no crashes (facade stub + lazy clients)
4. Adapters runtime-tested (tsx): db-env URL composition (SSL/encoding/idempotency), Redis facade (stub, fail-open limiter, unreachable server), Beacon (mock server: auth header, path, retries on 5xx, failure after 3 attempts, token never in errors), sendEmail→Beacon dispatch without RESEND_API_KEY.
5. Dependency audit: `stripe`, `@boxyhq/saml-jackson`, `dub`, `@dub/embed-react`, `@calcom/embed-react` uninstalled (0 importers, verified incl. dynamic imports); `@documenso/*` retained (agreements, actively used).

## Not yet tested (blocked on `.env`)

The full Phase-9 workflow list (login, signup, upload, view, share, restrict, data room, permissions, revoke, analytics, Beacon live send, Redis/Postgres connectivity) requires a `.env` with RDS/Redis/Beacon credentials — **no `.env` exists in this checkout yet** (only `.env.example` and `.env.janavi.example`). Once created (see "Getting started" in README), run `node scripts/janavi/smoke-infra.mjs` for infra connectivity, then the workflows above.

## Residual risks / notes

- **Beacon contract** assumed `{to, subject, html, text, replyTo, tags}` (+ passthroughs); single-file fix in `lib/emails/beacon.ts` if the real contract differs.
- **Edge middleware + Redis Cloud**: root-path redirect overrides for custom domains always use the fallback URL (Node-runtime feature; edge cannot speak RESP). Document viewing on custom domains unaffected.
- **Security controls preserved**: auth, RBAC, tenant isolation, link access policies, rate limits, INTERNAL_API_KEY service auth — untouched by the billing removal (verified per-file by the cleanup workstream).
- Pre-existing lint warnings (react-hooks/exhaustive-deps etc.) remain; no lint gate in CI for this repo.
- The `kind: "papermark"` discriminant in `ResolvedBrandLogo` and the `papermark.email` localStorage key are internal identifiers kept for compatibility (render as JANAVI).
- Legal links on auth pages still point to papermark.com/terms|privacy — decision needed: publish JANAVI legal pages or keep upstream references.
- Deviations noted in git: `ee/` + `app/(ee)/` deleted via `git rm` — recoverable from history if ever needed (never re-import them into JANAVI code).
