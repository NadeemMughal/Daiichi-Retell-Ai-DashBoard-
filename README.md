# Daiichi Retell AI Client Portal

A secure multi-tenant reporting portal for Daiichi-managed Retell AI agents. Clients access Daiichi only; Retell credentials and dashboard access remain internal.

## Implemented foundation

- Next.js 16 App Router with strict TypeScript
- Supabase Auth integration using secure SSR sessions
- Supabase PostgreSQL schema, grants, and tenant RLS
- Separate Daiichi platform roles and client tenant roles
- Shared Retell workspace with one-active-tenant-per-agent assignments
- Server-only Retell SDK adapter and read-only connectivity check
- Signed Retell webhook verification and idempotent inbox
- Scheduled webhook processing with assignment quarantine
- Live tenant-scoped KPI dashboard and explicit sample-data preview
- Daiichi operations console and Retell agent import
- Manual invoice usage snapshots based on server-side call/chat records
- Audit and sensitive-data access tables
- Strict typecheck, lint, unit tests, and production build

## Security model

The browser never calls Retell. An authenticated Supabase user is resolved to a Daiichi platform role and/or tenant membership. Every provider-data query is executed server-side with an explicit tenant constraint. Supabase's server secret bypasses RLS and is never browser-accessible.

An agent must have exactly one active tenant assignment before provider events are normalized. Unassigned agents are quarantined.

## Local setup

1. Create separate Supabase development and production projects.
2. Apply `supabase/migrations/0001_foundation.sql` in development.
3. Copy `.env.example` values into the existing untracked `.env` without committing secrets.
4. Create the initial Supabase Auth user.
5. Insert that user's `super_admin` role using the Supabase SQL editor while authenticated as a project administrator.
6. Run `npm run dev` and open `/admin`.
7. Synchronize Retell agents, create client tenants/memberships, and assign each agent before enabling webhooks.

Required Supabase variables:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_URL=
DATABASE_DIRECT_URL=
```

Required server variables:

```dotenv
RETELL_API_KEY=
RETELL_WEBHOOK_API_KEY=
CRON_SECRET=
```

`RETELL_WEBHOOK_API_KEY` may temporarily use the same designated Retell webhook key as `RETELL_API_KEY`, but separate restricted keys are preferred where the Retell workspace configuration permits it.

## Initial administrator bootstrap

After creating the first Auth user, execute this once in the trusted Supabase SQL editor, replacing the email:

```sql
insert into public.platform_role_assignments (user_id, role, granted_by)
select p.id, 'super_admin'::public.platform_role, p.id
from public.profiles p
where lower(p.email) = lower('ADMIN_EMAIL_HERE');

update public.profiles
set mfa_required = true
where lower(email) = lower('ADMIN_EMAIL_HERE');
```

## Verification commands

```text
npm run typecheck
npm run lint
npm test
npm run build
```

## Deployment order

1. Provision Supabase staging and apply migrations.
2. Configure Vercel preview/staging variables using non-production credentials.
3. Test Auth, RLS, agent assignment, webhook signatures, and reconciliation.
4. Provision production Supabase and apply the same reviewed migration.
5. Configure production-only Vercel secrets and Retell webhook URL.
6. Pilot one tenant before adding additional clients.

See [architecture](docs/ARCHITECTURE.md) for the trust boundary and shared-workspace decision.

