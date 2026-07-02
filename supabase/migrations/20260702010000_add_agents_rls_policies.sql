begin;

alter table public.agents enable row level security;

grant select on table public.agents to anon, authenticated;
grant insert on table public.agents to authenticated;
revoke update, delete on table public.agents from anon, authenticated;

create policy "Agents are publicly readable"
on public.agents
for select
to anon, authenticated
using (true);

create policy "Users can create their own agents"
on public.agents
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

commit;
