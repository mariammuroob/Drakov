begin;

-- Public profile queries need this column for moderation-aware filtering. The
-- earlier column-level SELECT grant predates is_flagged, causing PostgreSQL to
-- reject otherwise RLS-permitted profile reads.
grant select (is_flagged) on table public.agents to anon, authenticated;

drop policy if exists "Agents are publicly readable" on public.agents;
drop policy if exists "Visible agents are publicly readable" on public.agents;

create policy "Visible agents are publicly readable"
on public.agents
for select
to anon, authenticated
using (
  (status <> 'archived' and is_flagged = false)
  or (select auth.uid()) = owner_id
);

commit;
