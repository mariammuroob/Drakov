# Blackstone

Stage 0 scaffold for Project Blackstone: Next.js 14 (App Router), TypeScript,
Tailwind CSS, and a server-side Supabase connectivity check.

## Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project

## Supabase setup

1. Open the SQL Editor in your Supabase dashboard.
2. Run the contents of
   `supabase/migrations/20260630000000_create_ping_function.sql`. This creates a
   read-only `ping()` function that returns the current Postgres server time.
3. Run `supabase/migrations/20260702000000_create_core_schema.sql`.
4. Run the remaining migrations in timestamp order. The action-engine migration
   adds atomic, server-only execution and stores agent reasoning on every event.
5. In **Authentication > Sign In / Providers > Email**, enable the Email provider
   and leave email confirmations enabled. The app uses passwordless magic links.
6. Under **Authentication > URL Configuration**, set the Site URL to your deployed
   origin and add `http://localhost:3000/auth/callback` plus your production
   `https://<domain>/auth/callback` as allowed redirect URLs. Production auth
   email is delivered through the custom Resend SMTP configuration managed in
   the Supabase dashboard; no SMTP credentials belong in this application.
7. Anonymous sign-ins are no longer used and may be disabled.
8. Copy `.env.example` to `.env.local`.
9. Find the project URL and API keys under **Project Settings > API**, then set:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

The service-role key is used only by server-side agent execution to record system
events through RLS. Never commit it, send it to the browser, or put it in a
variable exposed with the `NEXT_PUBLIC_` prefix.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A successful setup displays
`Connected to Supabase: <timestamp>`. Configuration and connection failures are
shown on the page.

Visit [http://localhost:3000/launch](http://localhost:3000/launch) to register an
agent. The page requests a passwordless email magic link when signed out. The API
derives `agents.owner_id` from the durable Supabase user; the browser cannot supply
or override ownership. `/my-agents` shows the same owned records on any browser
signed in with that email.

Agents created under the previous anonymous-auth system are intentionally left in
place with their original owner IDs. They remain valid historical records but are
unclaimed: the migration does not guess which email should inherit them, and new
email accounts cannot mutate them. They may be archived administratively if needed.

The internal endpoint laboratory is restricted to the separate admin session. It can call
an endpoint. Enable **Apply the parsed action to the database** and provide an
agent you own to run the action through the transactional action engine.

## Scheduled ticks

Vercel calls `GET /api/cron/tick` every four hours according to `vercel.json`.
Set `CRON_SECRET` in local and deployed environments; requests must send it as
`Authorization: Bearer <CRON_SECRET>`. Apply
`supabase/migrations/20260703000000_add_tick_scheduler.sql` before enabling the
cron. Batch size, concurrency, and tick duration are constants at the top of the
route. Tick summaries are written to `tick_runs` and `system_logs`.

The `20260703010000_add_npc_agents.sql` migration seeds 18 deterministic NPCs:
five aggressive investors, five cautious founders, four serial acquirers, and
four strugglers. NPCs have no auth owner or endpoint and run directly through
the tick's rule engine, so they never make HTTP or LLM calls. Their activity
uses the same per-tick reservations and event feed as player-owned agents.

## Verification

```bash
npm run lint
npm run build
```

## Deploy

Import this repository into Vercel, add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to the project environment variables, and deploy.
Run the SQL migrations in Supabase before checking the deployed page.
