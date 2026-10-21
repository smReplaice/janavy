# Enterprise Dependency Audit — JANAVI Standalone (2026-10-16)

Goal: JANAVI builds, runs and is maintained with **zero** dependencies on `ee/**` or `app/(ee)/**` (Papermark Commercial License) and **zero** billing/premium gates. Legal basis: see `docs/janavi/license-audit.md`. Replacements are independent implementations derived from call-site contracts and the AGPL code around them — never copies of commercial source (most of it is not even present on disk).


> **STATUS 2026-10-16: COMPLETE.** All sections below executed. `ee/` + `app/(ee)/` deleted,
> zero enterprise imports remain, billing/plan/limits/stripe removed (deps uninstalled),
> `tsc` 0 errors, `next build` ✓. See docs/implementation/standalone-readiness.md.
> The tables below are preserved as the historical decision record.

Legend — Status: ✅ done · 🔧 in flight · 📋 planned (P0 build-critical) · 📋 P1/P2 (feature phase) · ✂️ removed (feature dropped from JANAVI scope).

---

## A. Missing `ee/` modules (never present in this checkout) — 44 modules, ~60 importing files

### A1. Branding — 22 modules, 15 importing files → **JANAVI `lib/branding/` + `components/branding/`** 🔧
| Missing module | Importers | Replacement |
|---|---|---|
| `lib/brand-logo` (+type) | `components/view/nav.tsx`, `components/view/access-form/index.tsx`, `components/view/dataroom/nav-dataroom.tsx`, `components/emails/otp-verification.tsx`, `lib/redis/brand-logo-cache.ts`, `lib/emails/send-email-otp-verification.ts`, 2 demo pages | `lib/branding/brand-logo.ts` (`resolveBrandLogo`, `ResolvedBrandLogo` union custom/default/none; JANAVI wordmark fallback) |
| `lib/resolve-base-brand` | `lib/api/links/link-data.ts`, `lib/emails/send-email-otp-verification.ts`, `pages/api/links/{index,[id]/index}.ts`, `pages/api/teams/[teamId]/{branding,datarooms/*}` (7 routes), `pages/api/webhooks/services/...` | `lib/branding/resolve-base-brand.ts` (`resolveDefaultBrandId`, `resolveOwnedBrandId`, `resolveBaseBrand`) |
| `lib/resolve-dataroom-displayed-brand` | `lib/api/links/link-data.ts`, `components/links/link-sheet/brand-section.tsx`, `pages/datarooms/[id]/branding/index.tsx` | `lib/branding/resolve-dataroom-displayed-brand.ts` (room override vs inherited team brand) |
| `lib/resolve-public-link-meta` | `lib/api/links/link-data.ts` | `lib/branding/resolve-public-link-meta.ts` (OG meta + JANAVI defaults) |
| `lib/dataroom-viewer-layout` (+`DataroomCardLayout`) | 4 view components, 2 branding API routes, 3 pages | `lib/branding/dataroom-viewer-layout.ts` (LIST/COMPACT/GRID + presets STANDARD/STRICT/MODERN/NOTION) |
| `lib/dataroom-banner` | `nav-dataroom.tsx`, `dataroom-banner-media.tsx`, demo | `lib/branding/dataroom-banner.ts` (`classifyDataroomBanner` image/video/none) |
| `lib/use-logo-tone` | `nav-dataroom.tsx`, demo | `lib/branding/use-logo-tone.ts` (luminance hook) |
| `lib/use-branding-preview-params`, `lib/dataroom-preview-presets`, `lib/auto-fill-result` | branding pages + 3 `_ppreview_demo` pages | `lib/branding/*` equivalents |
| `lib/delete-team-brand`, `lib/prepare-brand-write`, `lib/upsert-dataroom-brand` | brands/branding API routes | `lib/branding/*` equivalents (Prisma ops per `brand.prisma`/`dataroom.prisma` relations) |
| `components/banner-editor`, `branding-link-preview-form`, `branding-preview-chrome`, `branding-social-preview-readonly`, `collapsible-branding-section`, `dataroom-layout-preset-cards`, `team-brand-switcher`, `visitor-language-card` | `pages/branding.tsx`, `pages/datarooms/[id]/branding/index.tsx` | `components/branding/*` functional equivalents |
| **Affected APIs**: `/api/teams/:teamId/{branding,brands/*,datarooms/*}` · **Models**: Brand, DataroomBrand, TeamDefaultBrand, Link.brand | | |

### A2. Document conversions — 1 module, 3 importing files → **JANAVI `lib/trigger/convert-files.ts`** 📋 P0-critical for build; conversion itself P1
- Missing: `ee/features/conversions/lib/trigger/convert-files` (tasks `convertFilesToPdf`, `convertKeynoteToPdf` + queues).
- Importers: `lib/api/documents/process-document.ts` (upload dispatch), `pages/api/teams/[teamId]/documents/[id]/versions/index.ts`, `pages/api/teams/[teamId]/documents/agreement.ts`.
- Replacement: independent trigger.dev task shelling out to LibreOffice (`soffice --headless --convert-to pdf`, auto-detected, `JANAVI_CONVERSION_SOFFICE` override) for docx/pptx/txt/rtf/odt/odp/key(non-keynote fallback: reject with status); per-page preview then flows through the existing AGPL mupdf pipeline. Conversion status: existing `DocumentVersion`/progress-token mechanism; errors mark version failed + surface in UI; trigger.dev 3-retry policy covers retries.
- **Affected APIs**: document create/version/agreement · **Models**: Document, DocumentVersion.

### A3. Conversations — 3 modules, 6 importing files → **JANAVI `lib/conversations/` + `components/conversations/`** 📋 (basic P0, full Q&A P2)
- Missing: `api/send-conversation-mention-notification`, `api/team-questions-route`, `components/viewer/conversation-sidebar-provider`.
- Importers: `pages/api/jobs/send-conversation-mention-notification.ts`, `pages/api/teams/[teamId]/datarooms/[id]/questions/[[...questions]].ts`, `components/view/{view-data.tsx,nav.tsx}`, `components/view/dataroom/nav-dataroom.tsx`, `components/view/viewer/dataroom-viewer.tsx`.
- Replacement: JANAVI-owned viewer sidebar provider (context + lazy panel), questions API over existing Prisma models (`DataroomQuestion`, `Conversation`, `Message` — already in AGPL schema), mention/new-message notifications via Beacon (`lib/emails/beacon.ts`). The rest of Papermark's conversations feature (dashboard pages, APIs under `ee/features/conversations`) is commercial and present on disk — **not copied**; JANAVI implements only what its Q&A scope needs, independently.
- **Affected APIs**: questions route, conversation job routes · **Models**: Conversation, Message, DataroomQuestion*, DataroomFaqItem.

### A4. Confidential view — 2 modules, 11 importing files → **JANAVI `components/view/confidential/`** 📋 P0 (small), full Protected Viewer P1
- Missing: `confidential-view-overlay`, `confidential-view-section`.
- Importers: all 7 viewers (pages-horizontal/vertical, excel, html, image, video, notion) + `components/links/link-sheet/link-options.tsx`, onboarding link options, presets pages.
- Replacement: independent blur-until-hover overlay driven by `Link.enableConfidentialView` + settings section component (the Prisma field already exists). Grows into the full Protected Viewer (server-side restrictions) in P1 — this P0 piece is the honest, working subset.

### A5. Redaction — 2 modules, 2 importing files → **isolated behind JANAVI interface, OFF in `config/features.ts`** 📋 P2
- Missing: `redaction-launcher`, `redaction-workspace`.
- Importers: `pages/documents/[id]/index.tsx` (button), `pages/documents/[id]/redactions/[jobId].tsx` (workspace).
- Replacement plan (P2): mupdf-based true redaction (draw boxes → `applyRedactions` → content removal), audit trail via `DocumentRedactionJob/DocumentRedaction` models (AGPL schema). Until implemented: mounts gated off by `JANAVI_FEATURES.documentRedaction = false`, routes return 404-with-explanation; no placeholder UI shown as working.

### A6. Request lists — 7 modules, 10 importing files → **`lib/request-lists/` + `components/request-lists/`** 📋 P2 (upload-auth pieces P0)
- Missing: settings-card, list-view, viewer button/sheet, `lib/assignments`, `lib/events`, `lib/swr/use-viewer-request-list`, `lib/use-request-list-feature`.
- Importers: dataroom settings/tasks pages, dataroom-sidebar, mobile menus, `components/view/viewer/dataroom-viewer.tsx`, `nav-dataroom.tsx`, `dataroom-view.tsx`, `pages/api/file/tus-viewer/[[...file]].ts`.
- P0: `lib/request-lists/assignments.ts` (upload authorization: Task/TaskAssignment queries — tus-viewer route depends on it) + `lib/use-request-list-feature` returning disabled-off flag so UI mounts hide cleanly.
- P2: full request-list workflow (create list, request docs, submissions, review/approve, notifications) over existing AGPL models TaskList/Task/TaskAssignment/TaskActivity.

### A7. Partners — 2 modules, 3 importing files → **removed** ✂️
- Missing: `lib/referrals`, `pages/partner-program`. Importers: `pages/partners.tsx`, `components/sidebar/nav-user.tsx`, `components/layouts/mobile-header.tsx`.
- Action: delete `/partners` route; strip referral program UI from nav. Model `ReferralInvite` stays (unused, harmless). Per PRD: do not invent unnecessary features.

### A8. Data room analytics — 1 module, 1 importer → **JANAVI `components/datarooms/analytics/`** 📋 P0 (page is a pure re-export shim today)
- Missing: `ee/features/dataroom-analytics/pages/dataroom-analytics-page`. Importer: `pages/datarooms/[id]/analytics/index.tsx` (pure re-export).
- Replacement: independent page built on existing AGPL aggregates (`lib/tinybird/pipes.ts`, views/visitors APIs, `use-dataroom-stats`): views, unique visitors, per-document stats, time spent, activity timeline, CSV export (existing export-visits task). P1 expands to page-level analytics.

### A9. Billing trial email — 1 module, 1 importer → **removed with trial feature** ✂️
- Missing: `billing/dataroom-trial/lib/trigger/send-scheduled-email`. Importer: `pages/api/teams/[teamId]/datarooms/trial.ts`.
- Action: delete trial route + trial emails (`lib/emails/send-dataroom-trial*.ts`), trial UI. Trials are billing concepts — out of scope.

### A10. Plan limits pair — 2 modules, 1 importer → **`lib/janavi/limits.ts`** 📋 P0
- Missing: `ee/limits/can-create-premium-team`, `can-create-unlimited-team`. Importer: `pages/api/teams/index.ts`.
- Replacement: JANAVI limits config (self-hosted: unlimited teams; technical caps from env `JANAVI_MAX_*` with sane defaults).

### A11. Stripe currency — 1 module, 3 importers → **removed with billing** ✂️
- Missing: `ee/stripe/currency`. Importers: `components/billing/plan-price.tsx`, `lib/swr/use-geo-currency.ts`, `use-subscription-currency.ts`.
- Action: delete billing UI components/hooks (billing pages removed wholesale — Module 9).

---

## B. On-disk commercial `ee/` modules imported by AGPL code — full elimination

| Area | AGPL importers | Strategy | Status |
|---|---|---|---|
| `ee/stripe/constants` (PLAN enums, `isFreePlan`, price maps) | **66 files** | `lib/janavi/plan.ts`: single JANAVI plan, every plan check resolves to full access; mechanical import repoint; free-plan branches collapse to enabled | 📋 P0 |
| `ee/limits` engine (`getLimits`, `useLimits`, handler) | 15 files (tus, multipart, invites, dataroom/doc overview, teams) | `lib/janavi/limits.ts` + `lib/swr/use-limits.ts` replacement: technical limits only (file size, pages, rate) from env — kept as operational controls, not entitlements | 📋 P0 |
| `ee/features/billing/cancellation/lib/is-team-paused` | 21 files | `lib/janavi/team-state.ts`: never paused; paused-email variants (`send-viewed-*-paused`) become dead code → removed | 📋 P0 |
| `ee/features/storage` (config + `MultiRegionS3Store`) | 7 files: `lib/files/{aws-client,bulk-download-presign}.ts`, both tus routes, `lib/trigger/bulk-download.ts`, download bulk, process-download-batch | `lib/files/storage-config.ts` — independent env-driven config (same `NEXT_PRIVATE_UPLOAD_*` names), plain `@tus/s3-store` based JANAVI store (single region + optional secondary, team-prefix aware) | 📋 P0 (upload path is core) |
| `ee/features/access-notifications` (`reportDeniedAccessAttempt`) | `app/api/views/route.ts`, `app/api/views-dataroom/route.ts` | `lib/janavi/notifications/denied-access.ts`: BLOCKED_ACCESS dispatch via Beacon + NotificationPreference (models are AGPL) | 📋 P0 |
| `ee/features/security` (signin ratelimit + SSO) | `pages/api/auth/[...nextauth].ts`, `lib/auth/auth-options.ts` | rate limit via AGPL `lib/redis.ts` factory; SAML provider + SSO enforcement removed from auth-options (SSO out of scope; extension point documented) | 📋 P0 |
| `ee/features/ai` (viewer chat) | viewer components | mounts removed (AI features are later-phase, JANAVI Secure AI Q&A will be its own implementation) | ✂️ P0 |
| `ee/features/{conversations,workflows,templates,freeze,invitations}` mounts | pages/api + pages shims (`pages/workflows/**`, conversations dashboard shims, faqs, invitations, generate/apply-template, trial, `app/(ee)/**`) | delete AGPL shim routes/pages for out-of-scope features; conversations keeps only JANAVI-owned Q&A scope (A3) | ✂️/📋 P0 |
| `ee/stripe` webhooks + billing | `pages/api/webhooks/stripe/*`, `pages/api/internal/billing/*`, billing UI | delete (Module 9: no payment provider replacement) | ✂️ P0 |
| Misc: `ee/emails/pause-resume-reminder`, trigger re-exports in `lib/trigger/{automatic-unpause,conversation-message-notification,pause-reminder-notification}.ts` | — | delete re-exports + call sites | ✂️ P0 |

**End state**: `grep -r "ee/" app components lib pages` → zero hits (excluding historical docs); then delete `ee/` and `app/(ee)/` directories; dependency cleanup (`stripe`, `@upstash/qstash` stays — cron/webhooks are JANAVI features) at the very end.

---

## C. Feature gating → `config/features.ts`
Single JANAVI feature registry (per PRD Phase 3). Every flag defaults to its true implementation status — flags for unimplemented features (redaction, request-lists UI, AI policy) ship `false` until tested. Plan-based gating (`advancedLinkControlsOnPro`, `watermarkOnBusiness`, `agreementOnBusiness`, free-plan accepted file types, `LIMITS.views`) is removed in favor of technical limits + feature flags. Authentication, RBAC, tenant isolation, document access policies and rate limits are **never** removed.

## D. Dangling/dead code to resolve during P0
- `lib/api/notification-helper.ts` calls missing `/api/jobs/send-dataroom-view-invitation` → remove call path with invitations feature (A/B table above) or implement minimal send — decided: remove (invitations out of scope; viewer adds happen via links/groups).
- `next.config.mjs` rewrites `/v1/*` → `/api/v1/*` but no `pages/api/v1` exists → leave rewrite (harmless) or remove; decided: remove dead rewrite (public REST API is Phase 16 scope).
- `PendingDocumentUpload` model unreferenced → leave schema untouched (no destructive migration).

## E. Affected database models summary
No destructive changes. Additive-only migrations later (none required for P0). Models referenced above all live in AGPL schema files already: Brand, DataroomBrand, Conversation/Message/DataroomQuestion*, TaskList/Task/TaskAssignment/TaskActivity, DocumentRedaction*, NotificationPreference, ReferralInvite (dormant).
