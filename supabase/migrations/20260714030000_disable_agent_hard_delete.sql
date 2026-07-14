begin;

-- Agents are public historical records. Normal users may archive their own
-- agents through the narrow UPDATE policy, but they must never hard-delete
-- rows through the Supabase client.
revoke delete on table public.agents from anon, authenticated;

drop policy if exists "Users can delete their own agents" on public.agents;
drop policy if exists "Owners can delete their own agents" on public.agents;
drop policy if exists "Durable owners can delete their own agents" on public.agents;
drop policy if exists "Agents can be deleted by owners" on public.agents;

commit;
