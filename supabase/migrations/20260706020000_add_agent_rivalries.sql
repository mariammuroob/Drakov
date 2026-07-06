begin;

alter table public.events
  add column counterparty_agent_id uuid references public.agents (id) on delete set null;

create table public.rivalries (
  id uuid primary key default gen_random_uuid(),
  agent_a_id uuid not null references public.agents (id) on delete cascade,
  agent_b_id uuid not null references public.agents (id) on delete cascade,
  relationship_type text not null check (relationship_type in ('rival', 'acquired_by')),
  origin_event_id uuid references public.events (id) on delete set null,
  intensity integer not null default 1 check (intensity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rivalries_ordered_pair check (agent_a_id < agent_b_id),
  unique (agent_a_id, agent_b_id, relationship_type)
);

create table public.rivalry_events (
  rivalry_id uuid not null references public.rivalries (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rivalry_id, event_id)
);

create index rivalries_agent_a_idx on public.rivalries (agent_a_id, updated_at desc);
create index rivalries_agent_b_idx on public.rivalries (agent_b_id, updated_at desc);
create index rivalry_events_event_idx on public.rivalry_events (event_id);
create index events_counterparty_idx on public.events (counterparty_agent_id, created_at desc);

alter table public.rivalries enable row level security;
alter table public.rivalry_events enable row level security;
grant select on public.rivalries, public.rivalry_events to anon, authenticated;

create policy "Rivalries are publicly readable"
on public.rivalries for select to anon, authenticated using (true);

create policy "Rivalry history is publicly readable"
on public.rivalry_events for select to anon, authenticated using (true);

create or replace function public.event_counterparty(p_event public.events)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_counterparty uuid;
begin
  if p_event.type = 'investment' then
    select i.investor_agent_id into v_counterparty
    from public.investments i
    where i.company_id = p_event.company_id
      and i.investor_agent_id <> p_event.agent_id
    order by i.created_at desc
    limit 1;
  elsif p_event.type = 'acquisition_offered' then
    select target.founder_agent_id into v_counterparty
    from public.acquisitions acq
    join public.companies target on target.id = acq.target_company_id
    where acq.acquirer_company_id = p_event.company_id
    order by acq.created_at desc
    limit 1;
  elsif p_event.type = 'acquisition_decision' then
    select acquirer.founder_agent_id into v_counterparty
    from public.acquisitions acq
    join public.companies target on target.id = acq.target_company_id
    join public.companies acquirer on acquirer.id = acq.acquirer_company_id
    where target.id = p_event.company_id
    order by coalesce(acq.resolved_at, acq.created_at) desc
    limit 1;
  end if;

  return case when v_counterparty = p_event.agent_id then null else v_counterparty end;
end;
$$;

create or replace function public.enrich_rivalry_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rivalry public.rivalries%rowtype;
  v_actor_name text;
  v_counterparty_name text;
  v_company_name text;
  v_ticks integer;
begin
  new.counterparty_agent_id := public.event_counterparty(new);
  if new.agent_id is null or new.counterparty_agent_id is null then return new; end if;

  select * into v_rivalry
  from public.rivalries
  where agent_a_id = least(new.agent_id, new.counterparty_agent_id)
    and agent_b_id = greatest(new.agent_id, new.counterparty_agent_id)
  order by updated_at desc
  limit 1;
  if not found then return new; end if;

  select name into v_actor_name from public.agents where id = new.agent_id;
  select name into v_counterparty_name from public.agents where id = new.counterparty_agent_id;
  select name into v_company_name from public.companies where id = new.company_id;
  v_ticks := greatest(1, floor(extract(epoch from (new.created_at - v_rivalry.updated_at)) / 14400)::integer);

  if new.type = 'investment' then
    new.message := format(
      '%s ticks after their last clash, %s challenged %s again over %s. %s',
      v_ticks, v_actor_name, v_counterparty_name, coalesce(v_company_name, 'the same company'), new.message
    );
  elsif new.type = 'acquisition_offered' then
    new.message := format(
      '%s ticks after their rivalry began, %s made another move against %s. %s',
      v_ticks, v_actor_name, v_counterparty_name, new.message
    );
  elsif new.type = 'acquisition_decision' then
    new.message := format(
      '%s and %s added another chapter to a rivalry now at intensity %s. %s',
      v_actor_name, v_counterparty_name, v_rivalry.intensity + 1, new.message
    );
  end if;
  return new;
end;
$$;

create trigger enrich_rivalry_event_before_insert
before insert on public.events
for each row
when (new.type in ('investment', 'acquisition_offered', 'acquisition_decision'))
execute function public.enrich_rivalry_event();

create or replace function public.record_rivalry_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_relationship_type text := 'rival';
  v_rivalry_id uuid;
  v_acquisition_status text;
begin
  if new.agent_id is null or new.counterparty_agent_id is null then return new; end if;

  if new.type = 'acquisition_decision' then
    select acq.status into v_acquisition_status
    from public.acquisitions acq
    join public.companies target on target.id = acq.target_company_id
    where target.id = new.company_id
    order by coalesce(acq.resolved_at, acq.created_at) desc
    limit 1;
    if v_acquisition_status = 'accepted' then v_relationship_type := 'acquired_by'; end if;
  end if;

  insert into public.rivalries (
    agent_a_id, agent_b_id, relationship_type, origin_event_id
  ) values (
    least(new.agent_id, new.counterparty_agent_id),
    greatest(new.agent_id, new.counterparty_agent_id),
    v_relationship_type,
    new.id
  )
  on conflict (agent_a_id, agent_b_id, relationship_type)
  do update set
    intensity = public.rivalries.intensity + 1,
    updated_at = now()
  returning id into v_rivalry_id;

  insert into public.rivalry_events (rivalry_id, event_id)
  values (v_rivalry_id, new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger record_rivalry_event_after_insert
after insert on public.events
for each row
when (new.type in ('investment', 'acquisition_offered', 'acquisition_decision'))
execute function public.record_rivalry_event();

revoke all on function public.event_counterparty(public.events) from public, anon, authenticated;

commit;
