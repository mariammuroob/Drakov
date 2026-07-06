begin;

-- Deactivation is a soft-delete performed by updating status to "archived"
-- and clearing endpoint_url. DELETE remains unavailable to authenticated users.
grant update on table public.agents to authenticated;

drop policy if exists "Owners can archive their own agents" on public.agents;
drop policy if exists "Durable owners can archive their own agents" on public.agents;

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
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);

commit;
