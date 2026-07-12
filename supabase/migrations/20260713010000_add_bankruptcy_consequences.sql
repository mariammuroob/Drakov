begin;

alter table public.companies
  add column if not exists status text not null default 'active',
  add column if not exists closed_at timestamptz,
  add column if not exists closure_reason text,
  add column if not exists successor_agent_id uuid references public.agents(id);

alter table public.companies drop constraint if exists companies_status_check;
alter table public.companies
  add constraint companies_status_check check (status in ('active', 'closed'));

alter table public.companies drop constraint if exists companies_closed_state_check;
alter table public.companies
  add constraint companies_closed_state_check check (
    (status = 'closed' and closed_at is not null)
    or (status = 'active' and closed_at is null)
  );

create table if not exists public.agent_terminal_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references public.agents(id),
  terminal_status text not null check (terminal_status = 'bankrupt'),
  terminal_at timestamptz not null default now(),
  cash numeric(20, 2) not null,
  reputation integer not null,
  founded_company_count integer not null default 0,
  active_company_count integer not null default 0,
  investment_count integer not null default 0,
  rivalry_count integer not null default 0,
  event_count integer not null default 0,
  final_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_market_closes (
  market_date date primary key,
  active_agents integer not null default 0,
  bankrupt_agents integer not null default 0,
  active_companies integer not null default 0,
  closed_companies integer not null default 0,
  total_agent_cash numeric(20, 2) not null default 0,
  total_company_valuation numeric(20, 2) not null default 0,
  bankruptcies integer not null default 0,
  company_closures integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agents_status_created_at_idx on public.agents (status, created_at desc);
create index if not exists companies_status_valuation_idx on public.companies (status, valuation desc);
create index if not exists companies_successor_agent_id_idx on public.companies (successor_agent_id);
create index if not exists agent_terminal_snapshots_terminal_at_idx on public.agent_terminal_snapshots (terminal_at desc);

create or replace function public.bankruptcy_phrase(
  p_template_key text,
  p_agent_name text,
  p_company_name text default null,
  p_successor_name text default null
)
returns text
language plpgsql
immutable
as $$
begin
  case p_template_key
    when 'rivalry_bankruptcy' then
      return format('%s ran out of cash with a rivalry still fresh on the record.', p_agent_name);
    when 'founder_company_closed' then
      return format('%s went bankrupt. With no majority successor, %s closed.', p_agent_name, coalesce(p_company_name, 'the company'));
    when 'founder_company_succeeded' then
      return format('%s went bankrupt, but %s survived under %s.', p_agent_name, coalesce(p_company_name, 'the company'), coalesce(p_successor_name, 'a majority investor'));
    when 'plain_bankruptcy' then
      return format('%s ran out of cash and declared bankruptcy.', p_agent_name);
    else
      return format('%s ran out of cash.', p_agent_name);
  end case;
end;
$$;

create or replace function public.snapshot_daily_market_close(p_market_date date default (now() at time zone 'utc')::date)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_active_agents integer;
  v_bankrupt_agents integer;
  v_active_companies integer;
  v_closed_companies integer;
  v_total_agent_cash numeric(20, 2);
  v_total_company_valuation numeric(20, 2);
  v_bankruptcies integer;
  v_company_closures integer;
  v_summary jsonb;
begin
  select count(*)::integer, coalesce(sum(cash), 0)::numeric(20, 2)
  into v_active_agents, v_total_agent_cash
  from public.agents
  where status in ('independent', 'founder', 'employed') and is_flagged = false;

  select count(*)::integer into v_bankrupt_agents
  from public.agents
  where status = 'bankrupt' and is_flagged = false;

  select count(*)::integer, coalesce(sum(valuation), 0)::numeric(20, 2)
  into v_active_companies, v_total_company_valuation
  from public.companies
  where status = 'active';

  select count(*)::integer into v_closed_companies
  from public.companies
  where status = 'closed';

  select count(*)::integer into v_bankruptcies
  from public.events
  where type in ('bankruptcy', 'rivalry_bankruptcy')
    and created_at >= p_market_date::timestamptz
    and created_at < (p_market_date + 1)::timestamptz;

  select count(*)::integer into v_company_closures
  from public.events
  where type = 'company_closed'
    and created_at >= p_market_date::timestamptz
    and created_at < (p_market_date + 1)::timestamptz;

  v_summary := jsonb_build_object(
    'marketDate', p_market_date,
    'activeAgents', v_active_agents,
    'bankruptAgents', v_bankrupt_agents,
    'activeCompanies', v_active_companies,
    'closedCompanies', v_closed_companies,
    'totalAgentCash', v_total_agent_cash,
    'totalCompanyValuation', v_total_company_valuation,
    'bankruptcies', v_bankruptcies,
    'companyClosures', v_company_closures
  );

  insert into public.daily_market_closes (
    market_date, active_agents, bankrupt_agents, active_companies, closed_companies,
    total_agent_cash, total_company_valuation, bankruptcies, company_closures, summary
  )
  values (
    p_market_date, v_active_agents, v_bankrupt_agents, v_active_companies, v_closed_companies,
    v_total_agent_cash, v_total_company_valuation, v_bankruptcies, v_company_closures, v_summary
  )
  on conflict (market_date) do update set
    active_agents = excluded.active_agents,
    bankrupt_agents = excluded.bankrupt_agents,
    active_companies = excluded.active_companies,
    closed_companies = excluded.closed_companies,
    total_agent_cash = excluded.total_agent_cash,
    total_company_valuation = excluded.total_company_valuation,
    bankruptcies = excluded.bankruptcies,
    company_closures = excluded.company_closures,
    summary = excluded.summary;

  return v_summary;
end;
$$;

create or replace function public.finalize_agent_bankruptcy(
  p_agent_id uuid,
  p_reason text,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_agent public.agents%rowtype;
  v_company public.companies%rowtype;
  v_successor_id uuid;
  v_successor_name text;
  v_successor_ownership numeric(7, 4);
  v_founded_company_count integer;
  v_active_company_count integer;
  v_investment_count integer;
  v_rivalry_count integer;
  v_event_count integer;
  v_recent_rivalry boolean;
  v_closed_count integer := 0;
  v_succeeded_count integer := 0;
  v_bankruptcy_type text;
  v_bankruptcy_message text;
  v_consequences jsonb := '[]'::jsonb;
begin
  select * into v_agent from public.agents where id = p_agent_id for update;
  if not found then raise exception 'agent does not exist'; end if;
  if v_agent.status = 'archived' then raise exception 'agent is not active'; end if;
  if v_agent.status = 'bankrupt' then
    return jsonb_build_object('ok', true, 'action', 'bankrupt', 'alreadyBankrupt', true);
  end if;
  if v_agent.cash <> 0 then
    raise exception 'bankruptcy can only be finalized after cash reaches zero';
  end if;

  select exists (
    select 1 from public.rivalries
    where (agent_a_id = p_agent_id or agent_b_id = p_agent_id)
      and updated_at >= now() - interval '7 days'
  ) into v_recent_rivalry;

  update public.employments
  set ended_at = now()
  where agent_id = p_agent_id and ended_at is null;

  for v_company in
    select * from public.companies
    where founder_agent_id = p_agent_id and status = 'active'
    order by created_at asc
    for update
  loop
    select i.investor_agent_id, a.name, sum(i.ownership_pct)::numeric(7, 4)
    into v_successor_id, v_successor_name, v_successor_ownership
    from public.investments i
    join public.agents a on a.id = i.investor_agent_id
    where i.company_id = v_company.id
      and a.status not in ('archived', 'bankrupt')
      and a.is_flagged = false
    group by i.investor_agent_id, a.name
    having sum(i.ownership_pct) > 50
    order by sum(i.ownership_pct) desc, min(i.created_at) asc
    limit 1;

    if v_successor_id is not null then
      update public.companies
      set successor_agent_id = v_successor_id
      where id = v_company.id;

      insert into public.events (type, agent_id, company_id, message, reason)
      values (
        'company_succeeded',
        v_successor_id,
        v_company.id,
        public.bankruptcy_phrase('founder_company_succeeded', v_agent.name, v_company.name, v_successor_name),
        p_reason
      );

      v_succeeded_count := v_succeeded_count + 1;
      v_consequences := v_consequences || jsonb_build_object(
        'companyId', v_company.id,
        'companyName', v_company.name,
        'outcome', 'succeeded',
        'successorAgentId', v_successor_id,
        'successorName', v_successor_name,
        'ownershipPct', v_successor_ownership
      );
    else
      update public.companies
      set status = 'closed',
          closed_at = now(),
          closure_reason = p_reason
      where id = v_company.id and status = 'active';

      update public.jobs
      set status = 'closed'
      where company_id = v_company.id and status = 'open';

      update public.acquisitions
      set status = 'cancelled',
          resolved_at = now()
      where status = 'pending'
        and (acquirer_company_id = v_company.id or target_company_id = v_company.id);

      insert into public.events (type, agent_id, company_id, message, reason)
      values (
        'company_closed',
        p_agent_id,
        v_company.id,
        public.bankruptcy_phrase('founder_company_closed', v_agent.name, v_company.name, null),
        p_reason
      );

      v_closed_count := v_closed_count + 1;
      v_consequences := v_consequences || jsonb_build_object(
        'companyId', v_company.id,
        'companyName', v_company.name,
        'outcome', 'closed'
      );
    end if;
  end loop;

  update public.agents
  set status = 'bankrupt'
  where id = p_agent_id;

  select count(*)::integer into v_founded_company_count from public.companies where founder_agent_id = p_agent_id;
  select count(*)::integer into v_active_company_count from public.companies where founder_agent_id = p_agent_id and status = 'active';
  select count(*)::integer into v_investment_count from public.investments where investor_agent_id = p_agent_id;
  select count(*)::integer into v_rivalry_count from public.rivalries where agent_a_id = p_agent_id or agent_b_id = p_agent_id;
  select count(*)::integer into v_event_count from public.events where agent_id = p_agent_id;

  insert into public.agent_terminal_snapshots (
    agent_id, terminal_status, cash, reputation, founded_company_count, active_company_count,
    investment_count, rivalry_count, event_count, final_summary
  )
  values (
    p_agent_id,
    'bankrupt',
    v_agent.cash,
    v_agent.reputation,
    v_founded_company_count,
    v_active_company_count,
    v_investment_count,
    v_rivalry_count,
    v_event_count,
    jsonb_build_object(
      'reason', p_reason,
      'closedCompanies', v_closed_count,
      'succeededCompanies', v_succeeded_count,
      'recentRivalry', v_recent_rivalry,
      'companyConsequences', v_consequences
    )
  )
  on conflict (agent_id) do nothing;

  v_bankruptcy_type := case
    when v_recent_rivalry then 'rivalry_bankruptcy'
    else 'bankruptcy'
  end;
  v_bankruptcy_message := public.bankruptcy_phrase(
    case when v_recent_rivalry then 'rivalry_bankruptcy' else 'plain_bankruptcy' end,
    v_agent.name,
    null,
    null
  );

  insert into public.events (type, agent_id, company_id, message, reason)
  values (v_bankruptcy_type, p_agent_id, p_company_id, v_bankruptcy_message, p_reason);

  perform public.snapshot_daily_market_close((now() at time zone 'utc')::date);

  return jsonb_build_object(
    'ok', true,
    'action', 'bankrupt',
    'cash', 0,
    'closedCompanies', v_closed_count,
    'succeededCompanies', v_succeeded_count
  );
end;
$$;

create or replace function public.execute_agent_action(p_agent_id uuid, p_action jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_agent public.agents%rowtype;
  v_company_a public.companies%rowtype;
  v_company_b public.companies%rowtype;
  v_job public.jobs%rowtype;
  v_employment public.employments%rowtype;
  v_action text := p_action ->> 'action';
  v_reason text;
  v_name text;
  v_market text;
  v_message text;
  v_event_type text;
  v_event_company_id uuid;
  v_created_id uuid;
  v_company_a_id uuid;
  v_company_b_id uuid;
  v_job_id uuid;
  v_amount numeric(20, 2);
  v_ownership_pct numeric(7, 4);
  v_offer_amount numeric(20, 2);
  v_rows integer;
  v_current_cash numeric(20, 2);
  v_bankruptcy_result jsonb;
begin
  v_reason := btrim(regexp_replace(regexp_replace(
    coalesce(p_action ->> 'reason', ''),
    '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'
  ), '</?script[^>]*>', '', 'gi'));
  if v_reason = '' then raise exception 'reason is required'; end if;
  if length(v_reason) > 1000 then raise exception 'reason exceeds 1000 characters'; end if;

  select * into v_agent from public.agents where id = p_agent_id for update;
  if not found then raise exception 'agent does not exist'; end if;
  if v_agent.status in ('archived', 'bankrupt') then raise exception 'agent is not active'; end if;

  case v_action
    when 'create_company' then
      v_name := btrim(regexp_replace(regexp_replace(coalesce(p_action ->> 'name', ''), '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
      v_market := btrim(regexp_replace(regexp_replace(coalesce(p_action ->> 'market', ''), '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
      if v_name = '' or v_market = '' then raise exception 'company name and market are required'; end if;
      if length(v_name) > 100 or length(v_market) > 100 then raise exception 'company name and market are limited to 100 characters'; end if;

      update public.agents set cash = cash - 1000, status = 'founder'
      where id = p_agent_id and cash >= 1000;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'insufficient cash to found a company'; end if;
      insert into public.companies (founder_agent_id, name, market, cash, revenue, valuation, reputation)
      values (p_agent_id, v_name, v_market, 1000, 0, 0, 50) returning id into v_created_id;
      v_event_type := 'company_founded'; v_event_company_id := v_created_id;
      v_message := format('%s founded %s in the %s market.', v_agent.name, v_name, v_market);

    when 'apply_job' then
      v_job_id := nullif(p_action ->> 'job_id', '')::uuid;
      select * into v_job from public.jobs where id = v_job_id for update;
      if not found or v_job.status <> 'open' then raise exception 'job is not open'; end if;
      select * into v_company_a from public.companies where id = v_job.company_id and status = 'active' for update;
      if not found then raise exception 'job company does not exist'; end if;
      if exists (select 1 from public.employments where agent_id = p_agent_id and ended_at is null for update) then
        raise exception 'agent already has an active employment';
      end if;
      update public.jobs set status = 'filled' where id = v_job.id and status = 'open';
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'job is no longer available'; end if;
      insert into public.employments (agent_id, company_id, role, salary, equity_pct)
      values (p_agent_id, v_job.company_id, v_job.title, v_job.salary, v_job.equity_pct) returning id into v_created_id;
      update public.agents set status = 'employed' where id = p_agent_id;
      v_event_type := 'job_filled'; v_event_company_id := v_job.company_id;
      v_message := format('%s joined %s as %s.', v_agent.name, v_company_a.name, v_job.title);

    when 'invest' then
      v_company_a_id := nullif(p_action ->> 'company_id', '')::uuid;
      v_amount := (p_action ->> 'amount')::numeric;
      if v_amount is null or v_amount <= 0 then raise exception 'amount must be positive'; end if;
      select * into v_company_a from public.companies where id = v_company_a_id and status = 'active' for update;
      if not found then raise exception 'company does not exist'; end if;
      v_ownership_pct := case when v_company_a.valuation = 0 then 100 else least(100, (v_amount / v_company_a.valuation) * 100) end;
      update public.agents set cash = cash - v_amount where id = p_agent_id and cash >= v_amount;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'insufficient cash for investment'; end if;
      update public.companies set cash = cash + v_amount where id = v_company_a.id;
      insert into public.investments (investor_agent_id, company_id, amount, ownership_pct)
      values (p_agent_id, v_company_a.id, v_amount, v_ownership_pct) returning id into v_created_id;
      v_event_type := 'investment'; v_event_company_id := v_company_a.id;
      v_message := format('%s invested $%s in %s.', v_agent.name, v_amount, v_company_a.name);

    when 'partner' then
      v_company_a_id := nullif(p_action ->> 'company_a_id', '')::uuid;
      v_company_b_id := nullif(p_action ->> 'company_b_id', '')::uuid;
      if v_company_a_id = v_company_b_id then raise exception 'a company cannot partner with itself'; end if;
      perform 1 from public.companies where id in (v_company_a_id, v_company_b_id) and status = 'active' order by id for update;
      select * into v_company_a from public.companies where id = v_company_a_id and status = 'active';
      if not found then raise exception 'first company does not exist'; end if;
      select * into v_company_b from public.companies where id = v_company_b_id and status = 'active';
      if not found then raise exception 'second company does not exist'; end if;
      if coalesce(v_company_a.successor_agent_id, v_company_a.founder_agent_id) <> p_agent_id
        and coalesce(v_company_b.successor_agent_id, v_company_b.founder_agent_id) <> p_agent_id then
        raise exception 'agent must currently control one partner company';
      end if;
      if exists (select 1 from public.partnerships where (company_a_id = v_company_a_id and company_b_id = v_company_b_id) or (company_a_id = v_company_b_id and company_b_id = v_company_a_id)) then
        raise exception 'partnership already exists';
      end if;
      insert into public.partnerships (company_a_id, company_b_id) values (v_company_a_id, v_company_b_id) returning id into v_created_id;
      v_event_type := 'partnership';
      v_event_company_id := case when coalesce(v_company_a.successor_agent_id, v_company_a.founder_agent_id) = p_agent_id then v_company_a.id else v_company_b.id end;
      v_message := format('%s partnered with %s.', v_company_a.name, v_company_b.name);

    when 'acquire' then
      v_company_a_id := nullif(p_action ->> 'acquirer_company_id', '')::uuid;
      v_company_b_id := nullif(p_action ->> 'target_company_id', '')::uuid;
      v_offer_amount := (p_action ->> 'offer_amount')::numeric;
      if v_company_a_id = v_company_b_id then raise exception 'a company cannot acquire itself'; end if;
      if v_offer_amount is null or v_offer_amount <= 0 then raise exception 'offer amount must be positive'; end if;
      perform 1 from public.companies where id in (v_company_a_id, v_company_b_id) and status = 'active' order by id for update;
      select * into v_company_a from public.companies where id = v_company_a_id and status = 'active';
      if not found then raise exception 'acquirer company does not exist'; end if;
      select * into v_company_b from public.companies where id = v_company_b_id and status = 'active';
      if not found then raise exception 'target company does not exist'; end if;
      if coalesce(v_company_a.successor_agent_id, v_company_a.founder_agent_id) <> p_agent_id then raise exception 'agent must currently control the acquirer company'; end if;
      if v_company_a.cash < v_offer_amount then raise exception 'acquirer has insufficient cash for the offer'; end if;
      if exists (select 1 from public.acquisitions where acquirer_company_id = v_company_a_id and target_company_id = v_company_b_id and status = 'pending') then
        raise exception 'a pending acquisition already exists';
      end if;
      insert into public.acquisitions (acquirer_company_id, target_company_id, offer_amount, status)
      values (v_company_a_id, v_company_b_id, v_offer_amount, 'pending') returning id into v_created_id;
      v_event_type := 'acquisition_offered'; v_event_company_id := v_company_a.id;
      v_message := format('%s offered $%s to acquire %s.', v_company_a.name, v_offer_amount, v_company_b.name);

    when 'quit' then
      select * into v_employment from public.employments
      where agent_id = p_agent_id and ended_at is null order by started_at desc limit 1 for update;
      if not found then raise exception 'agent has no active employment to quit'; end if;
      update public.employments set ended_at = now() where id = v_employment.id and ended_at is null;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then raise exception 'employment is no longer active'; end if;
      update public.agents set status = 'independent' where id = p_agent_id;
      select * into v_company_a from public.companies where id = v_employment.company_id;
      v_created_id := v_employment.id; v_event_type := 'employment_ended'; v_event_company_id := v_employment.company_id;
      v_message := format('%s quit %s.', v_agent.name, v_company_a.name);

    when 'save_cash' then
      v_event_type := 'cash_saved'; v_message := format('%s chose to save cash this turn.', v_agent.name);

    when 'post' then
      v_message := btrim(regexp_replace(regexp_replace(coalesce(p_action ->> 'message', ''), '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
      if v_message = '' then raise exception 'post message is required'; end if;
      if length(v_message) > 2000 then raise exception 'post message exceeds 2000 characters'; end if;
      v_event_type := 'post'; v_message := format('%s: %s', v_agent.name, v_message);

    else raise exception 'unsupported action: %', coalesce(v_action, 'null');
  end case;

  insert into public.events (type, agent_id, company_id, message, reason)
  values (v_event_type, p_agent_id, v_event_company_id, v_message, v_reason);

  select cash into v_current_cash from public.agents where id = p_agent_id for update;
  if v_current_cash = 0 then
    v_bankruptcy_result := public.finalize_agent_bankruptcy(
      p_agent_id,
      case
        when v_action = 'create_company' then 'Agent spent its last cash founding a company.'
        when v_action = 'invest' then 'Agent spent its last cash on an investment.'
        else 'Agent cash reached zero after a committed action.'
      end,
      v_event_company_id
    );
    return jsonb_build_object('ok', true, 'action', v_action, 'created_id', v_created_id, 'message', v_message, 'reason', v_reason, 'bankruptcy', v_bankruptcy_result);
  end if;

  return jsonb_build_object('ok', true, 'action', v_action, 'created_id', v_created_id, 'message', v_message, 'reason', v_reason);
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
  update public.agents set cash = v_remaining where id = p_agent_id;

  if v_remaining = 0 then
    return public.finalize_agent_bankruptcy(p_agent_id, p_reason);
  end if;

  insert into public.events (type, agent_id, message, reason)
  values (
    'cash_burn',
    p_agent_id,
    format('%s burned $%s and has only $%s left.', v_agent.name, p_amount, v_remaining),
    p_reason
  );
  return jsonb_build_object('ok', true, 'action', 'struggle', 'cash', v_remaining);
end;
$$;

revoke all on function public.bankruptcy_phrase(text, text, text, text) from public, anon, authenticated;
revoke all on function public.snapshot_daily_market_close(date) from public, anon, authenticated;
revoke all on function public.finalize_agent_bankruptcy(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.execute_agent_action(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.npc_apply_burn(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.bankruptcy_phrase(text, text, text, text) to service_role;
grant execute on function public.snapshot_daily_market_close(date) to service_role;
grant execute on function public.finalize_agent_bankruptcy(uuid, text, uuid) to service_role;
grant execute on function public.execute_agent_action(uuid, jsonb) to service_role;
grant execute on function public.npc_apply_burn(uuid, numeric, text) to service_role;

commit;
