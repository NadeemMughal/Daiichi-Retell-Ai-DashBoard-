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

Synchronization runs on three clocks, each covering a case the others cannot.

`vercel.json` declares both scheduled jobs and is the unattended baseline: it needs no
database password, no vault secret and no manual SQL, so it works from the moment the
project deploys. `supabase/cron/setup_agent_import.sql` and
`supabase/cron/setup_process_webhooks.sql` do the same work from Supabase Cron and remain
the option for deployments that are not on Vercel. **Install one or the other, not both** —
they duplicate a 3000-record provider read. Both authenticate with `CRON_SECRET`.

Every open dashboard, client and operator alike, ticks `POST /api/dashboard/sync` every 30
seconds. That endpoint claims the run with a conditional update on
`retell_connections.last_sync_at` before doing any work, so the reconciliation happens once
per interval no matter how many people are watching, and a caller cannot force it to run
more often by asking more often. This is what keeps a record created in Retell visible
within half a minute rather than at the next scheduled run. Because a reconciliation reads
up to 1000 calls, chats and contacts, raising the frequency has a real provider cost;
`DASHBOARD_SYNC_INTERVAL_MS` and `DASHBOARD_TICK_MS` are the two constants to change
together.

Pressing **Sync Retell data** bypasses the interval entirely and reconciles immediately.
A run writes `dashboard_refresh_signals` for every tenant whose agents, calls or chats
changed, and each dashboard subscribes to that table over Supabase Realtime, so other
people's screens update as soon as the run finishes instead of on their next tick.

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

## Session export columns

The call and chat history export writes every column from stored data. Eight of them used
to be literal em dashes because the reconciliation never persisted the value even though
Retell returns it on the call payload: end-to-end latency, summary, the four post-call
custom analysis fields, the caller endpoints, and the agent version. `0011_session_export_fields.sql`
adds the columns and both the reconciliation and the webhook processor now fill them.

`calls.direction` previously held the channel for web calls, so "Channel Type" and
"Direction" exported the same value and neither was the caller direction. `call_type` now
holds the channel, `direction` holds inbound/outbound and is null where the channel never
had one, and the migration backfills existing rows. Loaders read the channel from either
column so rows written before the migration still report correctly.

`from_number` and `to_number` carry the same sensitivity as `contact_unmasked`: the
reconciliation only stores them when the tenant has contact masking switched off, and the
grant is revoked from `anon` and `authenticated` so they are reachable only through the
service role.

The file itself is written with a UTF-8 byte order mark, CRLF line endings and RFC 4180
quoting. Without the mark Excel reads the file as Windows-1252 and every em dash arrives as
mojibake, which is what "—" looked like as "â€"" in exported reports. Cells whose text
begins with `=`, `@`, `+` or `-` are prefixed with an apostrophe so a spreadsheet does not
evaluate what a caller said as a formula; values that are only digits and separators are
left alone so phone numbers keep their leading `+`.

A dashboard select names the columns 0011 adds and falls back to the columns that have
always existed when the database answers 42703, so an unapplied migration costs those
columns rather than blanking the page.
