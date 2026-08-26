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

