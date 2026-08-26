# Implementation status

## Completed

- Repository cleanup while preserving `.env`
- Application and dependency foundation
- Interactive responsive dashboard design
- Supabase Auth client/server integration
- Database schema and RLS migration
- Platform and tenant permission model
- Shared Retell workspace connection model
- Agent import and exclusive assignment API
- Retell signature verification and webhook inbox
- Webhook processing cron and quarantine behavior
- Tenant-scoped KPI dashboard loader
- Daiichi admin operations overview
- Manual invoice usage-snapshot API
- Initial unit tests and production build

## Supabase activation completed

- Supabase project keys configured locally in the untracked `.env`
- Database connection verified through the session-mode pooler
- Foundation migration applied transactionally
- Core tables verified through the server-only Data API
- Shared Retell connection record created with secret references only
- Two voice and two chat agents imported
- All imported agents intentionally remain unassigned
- Private `generated-reports` Storage bucket created

## Still requires client identity information

- Create the first administrator
- Run real RLS integration tests
- Assign agents to real client tenants
- Register and test the production-shaped Retell webhook flow

## Before production

- Rotate the Retell key disclosed in chat and update the server secret
- Configure a separately scoped History Read key if Retell permits it
- Confirm Retell attribution and consolidated billing details
- Select durable job/email providers or confirm Vercel-native choices
- Complete real database isolation tests
- Add client-specific KPI definitions
- Approve transcript/recording retention per client
- Perform security review and one-tenant pilot
