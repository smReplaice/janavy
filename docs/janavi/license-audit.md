# JANAVI License Audit — Sprint 1 (2026-10-16)

## Repository licenses

| Scope | License | Consequence for JANAVI |
|---|---|---|
| Everything outside `ee/` and `app/(ee)/` (root `LICENSE`) | **AGPLv3** | JANAVI is a modification of AGPL code → JANAVI itself must comply with AGPLv3: network-service use requires offering source to users. Keep the license text and copyright notices intact. |
| `ee/**`, `app/(ee)/**` (`ee/LICENSE.md`) | **Papermark Commercial License** | Production use requires a Papermark Enterprise subscription. **JANAVI must not build on it.** Dev/testing modification is permitted, but we adopt a stricter rule: JANAVI never imports from or adds to these trees; equivalents are implemented independently in AGPL space. |
| `CLA.md` | Contributor License Agreement (papermark) | Relevant only if contributing back upstream; no effect on internal use. |

## Critical structural finding

This checkout's AGPL code is **not self-contained**: ~60 AGPL files import 44 `ee/` modules that are absent from disk and from the entire git history of this fork (the published `ee/` tree is a subset of what the hosted product uses). Affected feature areas:

- `ee/features/branding/**` (22 modules) — replaced independently in `lib/branding/` + `components/branding/` (Sprint 1)
- `ee/features/conversions/lib/trigger/convert-files` — document→PDF conversion dispatch; JANAVI implements an independent conversion worker (Sprint 2+, PDF/image/sheet/video paths unaffected)
- `ee/features/permissions/components/confidential-view/*` — JANAVI Screen Shield (Sprint 3) replaces it
- `ee/features/request-lists/**` (7), `ee/features/redaction/components/*` (2), `ee/features/conversations/{api,components}` (3), `ee/features/dataroom-analytics/pages/*`, `ee/features/partners/**` (2), `ee/features/billing/dataroom-trial/lib/trigger/send-scheduled-email`, `ee/stripe/currency`, `ee/limits/{can-create-premium-team,can-create-unlimited-team}` — Sprint 1 scope: minimal independent implementations or removal of importing AGPL code so the app builds
- Dangling internal endpoint: `lib/api/notification-helper.ts` calls `/api/jobs/send-dataroom-view-invitation`, which does not exist anywhere

## `ee/` code present on disk (commercial — off-limits for JANAVI features, though some config/constant files are imported by AGPL code paths)
`ee/limits/` (plan-limit engine), `ee/stripe/` (billing), `ee/features/{access-notifications, ai, billing/*, conversations, conversions/python, dataroom-freeze, dataroom-invitations, permissions, security(+sso), storage, templates, workflows}`. Where AGPL files import these (e.g. `ee/stripe/constants` plan enums, `ee/features/storage/config`, `ee/limits` engine, `lib/is-team-paused`), they run under the commercial license — acceptable for local dev per its terms, **not** for JANAVI production. Sprint 6 (enterprise administration) replaces these touchpoints.

## Dependency audit (package-lock.json, 2026-10-16)

- 1,588 MIT · 342 Apache-2.0 · 116 ISC · 57 BSD-2/3 · 14 BlueOak · rest small counts.
- Copyleft / dual: `mupdf` **AGPL-3.0** (consistent with the AGPL codebase), `sharp` libvips binaries LGPL-3.0 (dynamic use, fine), `jszip` (MIT OR GPL-3 dual — MIT chosen by terms), `node-forge` (BSD OR GPL dual — BSD), `@boxyhq/saml-jackson` trans LGPL fixes (overridden versions pinned).
- No SSPL / BUSL / CC-BY-NC / unlicensed dependencies in the runtime tree. 13 UNKNOWN-license packages are permissive-in-fact transitive deps (`busboy`, `streamsearch`, `khroma`, `buffers`, etc.) — MIT-classic packages missing metadata fields.
- `xlsx` vendored from cdn.sheetjs.com (Apache-2.0 community build).
- Verdict: **no dependency blocks JANAVI**; the only licensing constraint is the repo's own AGPLv3 + the ee boundary above.

## Obligation summary for JANAVI production
1. Offer JANAVI source to network users (AGPLv3 §13) — i.e. JANAVI must be distributed/source-available to its users.
2. Never ship functionality derived from `ee/` or `app/(ee)/` without a Commercial Subscription; JANAVI equivalents are clean-room-ish independent implementations reading only call-site contracts (the missing modules were reconstructed from usage, not copied).
3. Preserve Papermark copyright notices, AGPL text, and this audit trail.
