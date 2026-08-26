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

## Requires Supabase project credentials

These cannot be executed safely without a real development Supabase project:

- Apply the SQL migration
- Generate database types from the deployed schema
- Create the first administrator
- Run real RLS integration tests
- Store the shared Retell connection row
- Import the four currently visible Retell agents into Supabase
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

