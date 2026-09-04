# Daiichi portal architecture

The implementation uses a single Daiichi-controlled Retell workspace because client workspaces would require separate payment-method administration. Clients never receive Retell access. Security isolation is enforced by Daiichi's Supabase tenant model, server authorization, agent assignments, and PostgreSQL Row-Level Security.

## Trust boundary

```text
Browser -> Supabase session -> Daiichi server authorization -> tenant-scoped data
                                                |
                                                -> server-only Retell API
Retell webhook -> raw-body signature verification -> durable inbox -> tenant assignment
```

The Retell API key is never a `NEXT_PUBLIC_*` variable and is never logged or returned by an endpoint.

## Shared-workspace safety rule

A Retell agent must have exactly one active tenant assignment before its calls or chats become customer-visible. Unknown agents and ambiguous assignments are quarantined. Every dashboard query uses the authenticated tenant and an internal resource ID; Retell IDs supplied by a browser never authorize access.

## Invoicing

The first release records manual invoice references and authoritative server-calculated call counts, seconds, and AI-message counts. Daiichi staff create and send invoices outside the application. Automated Stripe charging is intentionally deferred.

## Scheduled synchronization

Supabase Cron is the only scheduler. `supabase/cron/setup_agent_import.sql` runs the
Retell reconciliation and `supabase/cron/setup_process_webhooks.sql` drains the webhook
inbox; both authenticate with `CRON_SECRET` and share the same two vault secrets.
`vercel.json` declares no cron jobs, because Vercel Hobby only supports daily schedules
and a second scheduler would duplicate a 3000-record provider read. The operations page
refreshes its own view every minute but no longer triggers a provider import, so a full
sync happens on exactly one clock.

Each successful run records a `reconciliation_runs` row: the window reconciled, calls and
chats seen, and a difference count covering provider records whose agent this workspace
does not own plus any agent still missing a workspace assignment. `unassignedAgentCount`
in the sync response must be zero.

An additive column the deployed database does not have yet reports PostgREST
`PGRST204`. Ingestion drops that column, continues, and reports it: the sync response
carries `schemaDrift`, the operations page prints it, and the reconciliation row is
marked `SCHEMA_DRIFT`. A single unapplied migration therefore degrades one field
instead of dead-lettering every webhook. Apply pending migrations with
`node scripts/apply-realtime-migrations.mjs`, which is idempotent and reloads the
PostgREST schema cache.

## Deliberate behaviors

These are intentional. They look like defects during review, so they are recorded here.

**Portal separation is a routing convenience, not a security boundary.** `/login/admin`,
`/login/client` and `/login/super-admin` all authenticate against the same Supabase user
pool. Credentials are verified first, `/api/auth/portal` then resolves the account's real
role, and a mismatch signs the session straight back out. Choosing the wrong portal never
grants access, but it does not prevent authentication either. Authority comes from
`platform_role_assignments` and `tenant_memberships`, never from the URL.

**Every imported agent is auto-assigned to `daiichi-technologies`.** The workspace runs a
single client tenant, so an agent with no assignment is an operational fault: its webhooks
are quarantined as `UNASSIGNED_AGENT` and its calls never reach a dashboard. Automatic
assignment removes that failure mode. It does not widen client visibility, because a
tenant assignment alone shows a client nothing — `user_agent_access` grants are what make
an agent visible, and those stay manual. Introducing a second tenant means replacing this
rule with an explicit assignment step.

**`requirePermission` responds with `notFound()`.** An unauthorized resource is
indistinguishable from a missing one, so the application does not confirm that a tenant,
agent or invoice exists to someone who may not see it. A 404 from a protected route is
therefore the normal authorization failure signal, not evidence of a broken link.

## Server-only API surface

Some routes are intentionally operator tooling with no dashboard control. They are
permission-checked and covered by the route access matrix in `route-access.test.ts`.

- `POST /api/admin/invoices` — records a manual invoice with server-calculated usage.
  Invoices are issued outside the application, as described above.
- `POST|PATCH /api/admin/assignments` — assigns or moves an agent between tenants.
  Reassignment closes the old assignment and revokes that tenant's user grants.
- `GET /api/retell/health` — read-only Retell connectivity check.

## Schema present but not yet enforced

Reviewed and deliberately unfinished, so a reader does not mistake these for live controls.

- `data_access_logs` — no writer. Transcript and recording viewers are not built, so
  there is no sensitive-data read to log yet.
- `tenants.retention_days` — stored, never enforced. No deletion job exists.
- `profiles.mfa_required` — stored, never enforced. MFA is not wired into sign-in.
- `membership_permission_overrides` — applied by `requireAuthorizationContext` and capped
  so a client can never gain a `.manage` permission, but there is no UI to edit rows.

`docs/Daiichi-User-Roles-and-Access-Control-Report.pdf` and `docs/build_access_report.py`
describe the earlier per-role permission model. `permissions.ts` has since collapsed that
into three effective roles, so treat the report as historical.
