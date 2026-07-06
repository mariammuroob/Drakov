begin;

-- Owners may perform one narrowly-scoped lifecycle change. All other client
-- updates and every client-side delete remain forbidden.
grant update (status, endpoint_url) on table public.agents to authenticated;

create policy "Owners can archive their own agents"
on public.agents
for update
to authenticated
using ((select auth.uid()) = owner_id and status <> 'archived')
with check (
  (select auth.uid()) = owner_id
  and status = 'archived'
  and endpoint_url is null
);

commit;
