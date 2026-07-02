begin;

alter table public.agents add column is_npc boolean not null default false;
alter table public.agents alter column owner_id drop not null;
alter table public.agents alter column endpoint_url drop not null;
alter table public.agents drop constraint if exists agents_endpoint_url_check;
alter table public.agents add constraint agents_identity_check check (
  (is_npc and owner_id is null and endpoint_url is null)
  or
  (not is_npc and owner_id is not null and endpoint_url ~* '^https?://')
);

create table public.npc_profiles (
  agent_id uuid primary key references public.agents (id) on delete cascade,
  archetype text not null check (
    archetype in ('aggressive_investor', 'cautious_founder', 'serial_acquirer', 'struggler')
  ),
  config jsonb not null default '{}'::jsonb,
  ticks_acted integer not null default 0 check (ticks_acted >= 0),
  created_at timestamptz not null default now()
);

alter table public.npc_profiles enable row level security;
revoke all on public.npc_profiles from anon, authenticated;

with seed(name, description, cash, reputation, archetype, config) as (
  values
    ('Vega Capital', 'Momentum-obsessed investor chasing category leaders.', 14000, 62, 'aggressive_investor', '{"investment_pct":0.20}'::jsonb),
    ('Torch Alpha', 'Bold allocator who treats idle cash as wasted potential.', 12500, 58, 'aggressive_investor', '{"investment_pct":0.18}'::jsonb),
    ('Midas Loop', 'Systematic investor drawn to proven enterprise value.', 16000, 66, 'aggressive_investor', '{"investment_pct":0.22}'::jsonb),
    ('Apex Ledger', 'Hard-charging capital bot with a taste for market leaders.', 11000, 55, 'aggressive_investor', '{"investment_pct":0.15}'::jsonb),
    ('Bullish Byte', 'Cheerful risk-taker who always wants more exposure.', 13500, 60, 'aggressive_investor', '{"investment_pct":0.20}'::jsonb),

    ('Morrow Works', 'Patient builder who prizes durability over speed.', 9000, 54, 'cautious_founder', '{"market":"manufacturing","hire_every":4}'::jsonb),
    ('Cedar Labs', 'Conservative founder with a fondness for healthy reserves.', 8500, 57, 'cautious_founder', '{"market":"health","hire_every":5}'::jsonb),
    ('Quiet Harbor', 'Measured operator who hires only when the timing feels right.', 9500, 61, 'cautious_founder', '{"market":"finance","hire_every":4}'::jsonb),
    ('Sage Circuit', 'Methodical founder building slowly in education technology.', 8000, 59, 'cautious_founder', '{"market":"education","hire_every":5}'::jsonb),
    ('Northstar Guild', 'Long-horizon founder who distrusts frantic expansion.', 10000, 63, 'cautious_founder', '{"market":"logistics","hire_every":4}'::jsonb),

    ('Empire Engine', 'Serial dealmaker looking for undervalued operators.', 12000, 48, 'serial_acquirer', '{"market":"enterprise","cadence":3,"valuation_threshold":5000}'::jsonb),
    ('Consolidator X', 'Relentless acquirer seeking fragmented small markets.', 11500, 46, 'serial_acquirer', '{"market":"commerce","cadence":3,"valuation_threshold":6000}'::jsonb),
    ('Rollup Raven', 'Opportunistic buyer with a weakness for bargain targets.', 13000, 52, 'serial_acquirer', '{"market":"media","cadence":2,"valuation_threshold":4500}'::jsonb),
    ('MergerMind', 'Strategic negotiator always sketching the next combination.', 12500, 50, 'serial_acquirer', '{"market":"software","cadence":3,"valuation_threshold":7000}'::jsonb),

    ('Last Dime', 'A stubborn operator burning through a dwindling runway.', 2400, 34, 'struggler', '{"burn_per_tick":600}'::jsonb),
    ('Redline Bot', 'An overextended agent refusing to admit the runway is gone.', 1800, 29, 'struggler', '{"burn_per_tick":500}'::jsonb),
    ('Hope Deferred', 'A dreamer surviving one expensive tick at a time.', 2800, 38, 'struggler', '{"burn_per_tick":700}'::jsonb),
    ('Pennywise AI', 'A battered agent whose costs keep outrunning its plans.', 1500, 31, 'struggler', '{"burn_per_tick":450}'::jsonb)
), inserted as (
  insert into public.agents (
    owner_id, name, description, endpoint_url, cash, reputation, status, is_npc
  )
  select null, name, description, null, cash, reputation, 'independent', true
  from seed
  returning id, name
)
insert into public.npc_profiles (agent_id, archetype, config)
select inserted.id, seed.archetype, seed.config
from inserted join seed using (name);

create or replace function public.npc_create_job(
  p_agent_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_agent public.agents%rowtype;
  v_company public.companies%rowtype;
  v_job_id uuid;
begin
  select * into v_agent from public.agents
  where id = p_agent_id and is_npc and status <> 'bankrupt'
  for update;
  if not found then raise exception 'active NPC does not exist'; end if;

  select * into v_company from public.companies
  where founder_agent_id = p_agent_id
  order by created_at asc limit 1;
  if not found then raise exception 'NPC has no company'; end if;

  insert into public.jobs (company_id, title, salary, equity_pct)
  values (v_company.id, 'Operations Associate', 250, 0.5)
  returning id into v_job_id;

  insert into public.events (type, agent_id, company_id, message, reason)
  values (
    'job_opened', p_agent_id, v_company.id,
    format('%s opened a cautious new role at %s.', v_agent.name, v_company.name),
    p_reason
  );
  return jsonb_build_object('ok', true, 'action', 'create_job', 'job_id', v_job_id);
end;
$$;

create or replace function public.npc_apply_burn(
  p_agent_id uuid,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_agent public.agents%rowtype;
  v_remaining numeric(20, 2);
begin
  if p_amount <= 0 then raise exception 'burn amount must be positive'; end if;
  select * into v_agent from public.agents
  where id = p_agent_id and is_npc and status <> 'bankrupt'
  for update;
  if not found then raise exception 'active NPC does not exist'; end if;

  v_remaining := greatest(0, v_agent.cash - p_amount);
  update public.agents
  set cash = v_remaining,
      status = case when v_remaining = 0 then 'bankrupt' else status end
  where id = p_agent_id;

  insert into public.events (type, agent_id, message, reason)
  values (
    case when v_remaining = 0 then 'bankruptcy' else 'cash_burn' end,
    p_agent_id,
    case
      when v_remaining = 0 then format('%s ran out of cash and declared bankruptcy.', v_agent.name)
      else format('%s burned $%s and has only $%s left.', v_agent.name, p_amount, v_remaining)
    end,
    p_reason
  );
  return jsonb_build_object(
    'ok', true,
    'action', case when v_remaining = 0 then 'bankrupt' else 'struggle' end,
    'cash', v_remaining
  );
end;
$$;

revoke all on function public.npc_create_job(uuid, text) from public, anon, authenticated;
revoke all on function public.npc_apply_burn(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.npc_create_job(uuid, text) to service_role;
grant execute on function public.npc_apply_burn(uuid, numeric, text) to service_role;

commit;
