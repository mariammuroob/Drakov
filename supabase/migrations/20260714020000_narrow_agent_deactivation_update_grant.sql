begin;

-- Forward-only hardening for owner deactivation. A previous migration granted
-- broad UPDATE on public.agents to authenticated users; narrow it back down so
-- browser clients cannot directly modify balances, ownership, stats, endpoint
-- failure counts, or other protected columns.
revoke update on table public.agents from authenticated;
revoke update (
  status,
  endpoint_url,
  endpoint_verified,
  endpoint_verified_at,
  endpoint_status,
  endpoint_latency_ms
) on table public.agents from authenticated;

grant update (
  status,
  endpoint_url,
  endpoint_verified,
  endpoint_verified_at,
  endpoint_status,
  endpoint_latency_ms
) on table public.agents to authenticated;

drop policy if exists "Durable owners can deactivate their own agents" on public.agents;
drop policy if exists "Durable owners can archive their own agents" on public.agents;
drop policy if exists "Owners can archive their own agents" on public.agents;

create policy "Durable owners can deactivate their own agents"
on public.agents
for update
to authenticated
using (
  (select auth.uid()) = owner_id
  and status <> 'archived'
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
)
with check (
  (select auth.uid()) = owner_id
  and status = 'archived'
  and endpoint_url is null
  and endpoint_verified = false
  and endpoint_verified_at is null
  and endpoint_status is null
  and endpoint_latency_ms is null
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);

commit;
