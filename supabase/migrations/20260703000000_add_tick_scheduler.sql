begin;

create table public.tick_runs (
  id uuid primary key default gen_random_uuid(),
  tick_key timestamptz not null unique,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  processed_count integer not null default 0 check (processed_count >= 0),
  action_counts jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.agent_tick_actions (
  id uuid primary key default gen_random_uuid(),
  tick_run_id uuid not null references public.tick_runs (id) on delete cascade,
  agent_id uuid not null references public.agents (id),
  action text not null default 'pending',
  succeeded boolean,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (tick_run_id, agent_id)
);

create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'warning', 'error')),
  message text not null check (length(btrim(message)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index agent_tick_actions_agent_id_idx
  on public.agent_tick_actions (agent_id);
create index system_logs_created_at_desc_idx
  on public.system_logs (created_at desc);

alter table public.tick_runs enable row level security;
alter table public.agent_tick_actions enable row level security;
alter table public.system_logs enable row level security;

revoke all on public.tick_runs, public.agent_tick_actions, public.system_logs
  from anon, authenticated;

create or replace function public.resolve_acquisition(
  p_acquisition_id uuid,
  p_target_agent_id uuid,
  p_decision jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_acquisition public.acquisitions%rowtype;
  v_acquirer public.companies%rowtype;
  v_target public.companies%rowtype;
  v_target_agent public.agents%rowtype;
  v_decision text := p_decision ->> 'decision';
  v_reason text := btrim(coalesce(p_decision ->> 'reason', ''));
  v_counter_amount numeric(20, 2);
  v_message text;
begin
  if v_reason = '' then raise exception 'reason is required'; end if;

  select * into v_acquisition
  from public.acquisitions
  where id = p_acquisition_id and status = 'pending'
  for update;
  if not found then raise exception 'pending acquisition does not exist'; end if;

  select * into v_acquirer
  from public.companies where id = v_acquisition.acquirer_company_id
  for update;
  select * into v_target
  from public.companies where id = v_acquisition.target_company_id
  for update;
  if v_target.founder_agent_id <> p_target_agent_id then
    raise exception 'agent does not control the target company';
  end if;
  select * into v_target_agent from public.agents where id = p_target_agent_id;

  case v_decision
    when 'accept' then
      if v_acquirer.cash < v_acquisition.offer_amount then
        raise exception 'acquirer no longer has enough cash';
      end if;
      update public.companies
      set cash = cash - v_acquisition.offer_amount
      where id = v_acquirer.id;
      update public.companies
      set cash = cash + v_acquisition.offer_amount
      where id = v_target.id;
      update public.acquisitions
      set status = 'accepted', resolved_at = now()
      where id = v_acquisition.id;
      v_message := format(
        '%s accepted %s''s $%s acquisition offer for %s.',
        v_target.name, v_acquirer.name, v_acquisition.offer_amount, v_target.name
      );

    when 'reject' then
      update public.acquisitions
      set status = 'rejected', resolved_at = now()
      where id = v_acquisition.id;
      v_message := format(
        '%s rejected %s''s acquisition offer.', v_target.name, v_acquirer.name
      );

    when 'counter' then
      v_counter_amount := (p_decision ->> 'counter_amount')::numeric;
      if v_counter_amount is null or v_counter_amount <= 0 then
        raise exception 'counter amount must be positive';
      end if;
      update public.acquisitions
      set offer_amount = v_counter_amount, created_at = now()
      where id = v_acquisition.id;
      v_message := format(
        '%s countered %s with a $%s acquisition price.',
        v_target.name, v_acquirer.name, v_counter_amount
      );

    else
      raise exception 'decision must be accept, reject, or counter';
  end case;

  insert into public.events (type, agent_id, company_id, message, reason)
  values (
    'acquisition_decision', p_target_agent_id, v_target.id, v_message, v_reason
  );

  return jsonb_build_object(
    'ok', true,
    'decision', v_decision,
    'acquisition_id', v_acquisition.id,
    'message', v_message
  );
end;
$$;

revoke all on function public.resolve_acquisition(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.resolve_acquisition(uuid, uuid, jsonb)
  to service_role;

commit;
