# Janavy Branding Audit

Date: 2026-10-20 · Verified by: `tests/e2e/janavy-branding.spec.ts` (8/8 PASSED — DOM-level scan of rendered UI, not just source)

## Screens audited (rendered DOM scanned for "Papermark", "JANAVI", "papermark.com"; broken-image check; title checks)

| Screen | Old branding | New branding | Test result |
|---|---|---|---|
| Login | Papermark testimonial, Backtrace photo, customer logos, papermark.com legal links | JV symbol + wordmark lockup above email field; capability carousel (5 slides, 5 s autoplay, dots/arrows, hover-pause, reduced-motion); janavy.com legal links | PASS |
| Register | Papermark links/copy | Same Janavy treatment | PASS |
| OTP verification | Own Papermark `TestimonialSection` + LogoCloud | "Verify your email" / "We've sent a verification code to your email."; OTP input, Verify, Resend Code (re-requests via the real signin flow), Back to Login; carousel panel | PASS |
| Invitation acceptance | "Jaski" testimonial + photo + DocSend copy | Janavy positioning panel (capabilities, no third-party quotes) | PASS |
| Welcome/onboarding | "Papermark gives you the power…", papermarkassets.com product video, example doc named papermark | "Share sensitive documents securely, control who can access them, and stay in control of your information — even after sharing."; JV-symbol illustration; janavy-example-document.pdf | PASS |
| Dashboard / Documents / Data rooms / Settings / Branding | support@papermark.com, survey "What do you use Papermark for?", og-preview hostname, domain-copy referencing papermark.com | Janavy equivalents; empty state "Your secure workspace starts here. Upload a document to share it with confidence." | PASS |
| Viewer chrome | Fallback wordmark "Papermark" + papermark.com link, papermark-p.svg | "JANAVY" wordmark → janavy.com; official JV symbol | PASS |
| Email templates | "Login for Papermark" subject; various subjects/copy | "Your Janavy verification code"; Janavy-branded OTP template (code, 15-min expiry, tagline, legal links) | PASS (source + live dispatch verified via Beacon thread list) |
| Metadata/SEO | Papermark titles/OG | "Login | Janavy" etc.; OG hostname janavy.com; OG image Janavy wordmark | PASS |

## Centralization
- `config/branding.ts` (new): productName/wordmark/tagline/website/legal URLs + positioning copy constants.
- `lib/branding/janavy.ts` (JANAVI_BRAND): runtime brand values (official janavy.com palette #0A1234/#123DFF/#FFD236, assets, legal).

## Infrastructure fixes made during this pass
- `middleware.ts` now excludes `/images/` — brand assets previously 307'd to /login for logged-out visitors (the "broken logo" on the login page).
- Beacon adapter: real contract (`uuid`/`service_name`/`domain_number`/`is_reply`+`is_new`/`from_name`/`to[]`), `BEACON_API_URL` support, safe diagnostics, delivery-status observer (API_ACCEPTED/DISPATCHED — never claims DELIVERED).
- **OTP delivery root cause fixed**: `lib/resend.ts` redirected ALL dev email to `delivered@resend.dev`; now opt-in via `JANAVI_EMAIL_SINK`. Verified live: code dispatched via SES to the real recipient, login completes.
- Login page carousel (per spec) + auth pages fit desktop viewport with no vertical scrolling.

## Intentionally retained (not user-facing)
- Internal identifiers/env (`lib/janavi/`, `JANAVI_*` vars, `JANAVI_BRAND`), `papermark.email` localStorage key (session compat), `kind:"papermark"` type discriminant, domain-guard strings that block lookalike domains, LICENSE/AGPL/CLA attribution, upstream README credit.
