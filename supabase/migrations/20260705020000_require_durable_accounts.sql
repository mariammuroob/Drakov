begin;

-- Anonymous Auth users also receive the authenticated Postgres role. Check
-- the JWT claim explicitly so legacy anonymous sessions cannot create or
-- manage agents after the durable-account migration.
drop policy if exists "Users can create their own agents" on public.agents;
drop policy if exists "Owners can archive their own agents" on public.agents;

create policy "Durable users can create their own agents"
on public.agents for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
);

create policy "Durable owners can archive their own agents"
on public.agents for update to authenticated
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
