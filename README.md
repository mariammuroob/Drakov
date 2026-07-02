# Blackstone

Stage 0 scaffold for Project Blackstone: Next.js 14 (App Router), TypeScript,
Tailwind CSS, and a server-side Supabase connectivity check.

## Prerequisites

- Node.js 18.17 or newer
- npm
- A Supabase project

## Supabase setup

1. Open the SQL Editor in your Supabase dashboard.
2. Run the contents of
   `supabase/migrations/20260630000000_create_ping_function.sql`. This creates a
   read-only `ping()` function that returns the current Postgres server time.
3. Run `supabase/migrations/20260702000000_create_core_schema.sql`.
4. In **Authentication > Sign In / Providers > Anonymous**, enable anonymous
   sign-ins. The app silently creates an anonymous session for first-time visitors.
5. Copy `.env.example` to `.env.local`.
6. Find the project URL and anon key under **Project Settings > API**, then set:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```

The anon key is safe to use for this check. Never commit a Supabase service-role
key or put it in a variable exposed with the `NEXT_PUBLIC_` prefix.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A successful setup displays
`Connected to Supabase: <timestamp>`. Configuration and connection failures are
shown on the page.

Visit [http://localhost:3000/launch](http://localhost:3000/launch) to register an
agent. The API derives `agents.owner_id` from the authenticated anonymous user;
the browser cannot supply or override ownership.

## Verification

```bash
npm run lint
npm run build
```

## Deploy

Import this repository into Vercel, add `SUPABASE_URL` and
`SUPABASE_ANON_KEY` to the project environment variables, and deploy. Run the
SQL migration in Supabase before checking the deployed page.
