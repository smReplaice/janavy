<div align="center">
  <h1 align="center">JANAVY</h1>
  <h3>Share with Confidence. Stay in Control.</h3>
</div>

<br/>

JANAVY is secure document sharing infrastructure: share documents and virtual
data rooms through controlled links with DRM-style protections — dynamic
watermarks, download blocking, email verification, expiration and instant
revocation — plus page-by-page analytics on every view. JANAVY is a
self-hosted fork of [Papermark](https://github.com/mfts/papermark), the
open-source DocSend alternative.

## Features

- **Secure document sharing:** upload documents (PDF, images, spreadsheets,
  video) and share them via permissioned links.
- **Link access controls:** email OTP verification, passcode protection,
  allow/deny lists, expiration dates, and immediate access revocation.
- **DRM controls:** dynamic watermarks (client overlay while viewing,
  server-side burn-in on downloads) and server-enforced download blocking.
- **Virtual data rooms:** organize documents into folders with per-folder
  permission groups and bulk download.
- **Analytics:** views, visitors, watch time per page and CSV export for
  documents and data rooms.
- **Notifications:** real-time view notifications and dataroom digests via
  email and integrations.
- **Self-hosted:** run it on your own infrastructure with your own database,
  Redis, storage and domain.

## Quick start

```shell
# 1. Configure the environment (see .env.janavy.example for all variables)
cp .env.janavy.example .env
#    then fill in the values: database (AWS RDS PostgreSQL), Redis,
#    blob storage, email (Replaice Beacon API) and auth providers.

# 2. Install dependencies
npm install

# 3. Generate the Prisma client
npx prisma generate

# 4. Run the dev server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Documentation

- [`docs/architecture/`](./docs/architecture/) — system, database, security
  and document-lifecycle diagrams, plus the
  [enterprise dependency audit](./docs/architecture/enterprise-dependency-audit.md).
- [`docs/janavy/license-audit.md`](./docs/janavy/license-audit.md) — audit of
  licensing obligations for this fork.
- [`config/features.ts`](./config/features.ts) — the JANAVY feature registry:
  every capability that is shipped and enabled is flagged there.

## Tech stack

- [Next.js](https://nextjs.org/) — framework
- [TypeScript](https://www.typescriptlang.org/) — language
- [Tailwind](https://tailwindcss.com/) — CSS
- [shadcn/ui](https://ui.shadcn.com) — UI components
- [Prisma](https://prisma.io) — ORM
- [PostgreSQL](https://www.postgresql.org/) — database
- [NextAuth.js](https://next-auth.js.org/) — authentication
- [Tinybird](https://tinybird.co) — analytics
- [Resend](https://resend.com) / Replaice Beacon — email

## License

JANAVY is licensed under the [GNU Affero General Public License v3.0](./LICENSE)
(AGPLv3), the license of its upstream project.

This project is a fork of [Papermark](https://github.com/mfts/papermark) by
[Marc Seitz](https://github.com/mfts) and contributors. We thank them for
building and open-sourcing the foundation JANAVY builds upon; upstream
copyright notices and license headers are preserved throughout the codebase.
