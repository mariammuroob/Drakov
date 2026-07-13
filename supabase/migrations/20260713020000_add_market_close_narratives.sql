begin;

create table if not exists public.market_cash_movements (
  id uuid primary key default gen_random_uuid(),
  actor_agent_id uuid references public.agents(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  entity_type text not null check (entity_type in ('agent', 'company')),
  entity_id uuid not null,
  entity_name text not null,
  amount numeric(20, 2) not null check (amount <> 0),
  reason text not null,
  event_type text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists market_cash_movements_created_at_idx
  on public.market_cash_movements (created_at desc);
create index if not exists market_cash_movements_entity_idx
  on public.market_cash_movements (entity_type, entity_id, created_at desc);
create index if not exists market_cash_movements_company_idx
  on public.market_cash_movements (company_id, created_at desc);

alter table public.market_cash_movements enable row level security;
grant select on public.market_cash_movements to anon, authenticated;
create policy "Market cash movements are publicly readable"
on public.market_cash_movements for select to anon, authenticated using (true);

alter table public.daily_market_closes
  add column if not exists biggest_cash_gain jsonb,
  add column if not exists biggest_cash_loss jsonb,
  add column if not exists newest_rivalry jsonb,
  add column if not exists highest_intensity_rivalry jsonb,
  add column if not exists closest_to_bankruptcy_agent jsonb,
  add column if not exists most_interacted_company jsonb,
  add column if not exists generated_at timestamptz not null default now();

create or replace function public.record_market_cash_movement(
  p_actor_agent_id uuid,
  p_company_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_name text,
  p_amount numeric,
  p_reason text,
  p_event_type text,
  p_reference_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_amount = 0 then return; end if;
  insert into public.market_cash_movements (
    actor_agent_id, company_id, entity_type, entity_id, entity_name, amount, reason, event_type, reference_id
  )
  values (
    p_actor_agent_id, p_company_id, p_entity_type, p_entity_id, left(p_entity_name, 200), p_amount,
    left(coalesce(nullif(btrim(p_reason), ''), p_event_type), 500), p_event_type, p_reference_id
  );
end;
$$;

create or replace function public.acquisition_phrase(
  p_template_key text,
  p_acquirer_name text,
  p_target_name text,
  p_offer_amount numeric,
  p_rejected_offer_count integer default 0,
  p_rivalry_intensity integer default null
)
returns text
language plpgsql
immutable
as $$
begin
  case p_template_key
    when 'offered_rivalry' then
      return format(
        '%s put $%s on the table for %s with rivalry intensity already at %s.',
        p_acquirer_name, p_offer_amount, p_target_name, coalesce(p_rivalry_intensity, 1)
      );
    when 'offered_after_rejections' then
      return format(
        '%s came back for %s with a $%s offer after %s earlier rejection%s.',
        p_acquirer_name, p_target_name, p_offer_amount, p_rejected_offer_count,
        case when p_rejected_offer_count = 1 then '' else 's' end
      );
    when 'offered_first_time' then
      return format('%s made a first recorded $%s acquisition run at %s.', p_acquirer_name, p_offer_amount, p_target_name);
    when 'accepted_rivalry' then
      return format(
        '%s accepted %s''s $%s offer, ending the fight as an acquisition.',
        p_target_name, p_acquirer_name, p_offer_amount
      );
    when 'accepted_plain' then
      return format('%s accepted %s''s $%s acquisition offer.', p_target_name, p_acquirer_name, p_offer_amount);
    when 'rejected_rivalry' then
      return format(
        '%s rejected %s again. The rivalry stayed alive at intensity %s.',
        p_target_name, p_acquirer_name, coalesce(p_rivalry_intensity, 1)
      );
    when 'rejected_plain' then
      return format('%s rejected %s''s acquisition offer.', p_target_name, p_acquirer_name);
    when 'counter_rivalry' then
      return format(
        '%s countered %s at $%s instead of letting the rivalry end cheaply.',
        p_target_name, p_acquirer_name, p_offer_amount
      );
    when 'counter_plain' then
      return format('%s countered %s with a $%s acquisition price.', p_target_name, p_acquirer_name, p_offer_amount);
    else
      return format('%s made a $%s acquisition offer for %s.', p_acquirer_name, p_offer_amount, p_target_name);
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
  v_window_start timestamptz := p_market_date::timestamptz;
  v_window_end timestamptz := (p_market_date + 1)::timestamptz;
  v_active_agents integer;
  v_bankrupt_agents integer;
  v_active_companies integer;
  v_closed_companies integer;
  v_total_agent_cash numeric(20, 2);
  v_total_company_valuation numeric(20, 2);
  v_bankruptcies integer;
  v_company_closures integer;
  v_biggest_cash_gain jsonb;
  v_biggest_cash_loss jsonb;
  v_newest_rivalry jsonb;
  v_highest_intensity_rivalry jsonb;
  v_closest_to_bankruptcy_agent jsonb;
  v_most_interacted_company jsonb;
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
    and created_at >= v_window_start
    and created_at < v_window_end;

  select count(*)::integer into v_company_closures
  from public.events
  where type = 'company_closed'
    and created_at >= v_window_start
    and created_at < v_window_end;

  select jsonb_build_object(
    'entityType', entity_type,
    'entityId', entity_id,
    'entityName', entity_name,
    'amount', amount,
    'reason', reason,
    'eventType', event_type,
    'createdAt', created_at
  )
  into v_biggest_cash_gain
  from public.market_cash_movements
  where created_at >= v_window_start and created_at < v_window_end and amount > 0
  order by amount desc, created_at desc
  limit 1;

  select jsonb_build_object(
    'entityType', entity_type,
    'entityId', entity_id,
    'entityName', entity_name,
    'amount', amount,
    'reason', reason,
    'eventType', event_type,
    'createdAt', created_at
  )
  into v_biggest_cash_loss
  from public.market_cash_movements
  where created_at >= v_window_start and created_at < v_window_end and amount < 0
  order by amount asc, created_at desc
  limit 1;

  select jsonb_build_object(
    'id', r.id,
    'agentAId', r.agent_a_id,
    'agentAName', a.name,
    'agentBId', r.agent_b_id,
    'agentBName', b.name,
    'relationshipType', r.relationship_type,
    'intensity', r.intensity,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  )
  into v_newest_rivalry
  from public.rivalries r
  join public.agents a on a.id = r.agent_a_id
  join public.agents b on b.id = r.agent_b_id
  where r.created_at >= v_window_start and r.created_at < v_window_end
    and a.is_flagged = false and b.is_flagged = false
  order by r.created_at desc
  limit 1;

  select jsonb_build_object(
    'id', r.id,
    'agentAId', r.agent_a_id,
    'agentAName', a.name,
    'agentBId', r.agent_b_id,
    'agentBName', b.name,
    'relationshipType', r.relationship_type,
    'intensity', r.intensity,
    'createdAt', r.created_at,
    'updatedAt', r.updated_at
  )
  into v_highest_intensity_rivalry
  from public.rivalries r
  join public.agents a on a.id = r.agent_a_id
  join public.agents b on b.id = r.agent_b_id
  where a.is_flagged = false and b.is_flagged = false
  order by r.intensity desc, r.updated_at desc
  limit 1;

  select jsonb_build_object(
    'id', id,
    'name', name,
    'cash', cash,
    'status', status
  )
  into v_closest_to_bankruptcy_agent
  from public.agents
  where status in ('independent', 'founder', 'employed') and is_flagged = false
  order by cash asc, created_at asc
  limit 1;

  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'market', c.market,
    'status', c.status,
    'interactionCount', count(e.id)::integer
  )
  into v_most_interacted_company
  from public.companies c
  join public.events e on e.company_id = c.id
  where e.created_at >= v_window_start and e.created_at < v_window_end and e.is_flagged = false
  group by c.id, c.name, c.market, c.status
  order by count(e.id) desc, max(e.created_at) desc
  limit 1;

  v_summary := jsonb_build_object(
    'marketDate', p_market_date,
    'windowStart', v_window_start,
    'windowEnd', v_window_end,
    'activeAgents', v_active_agents,
    'bankruptAgents', v_bankrupt_agents,
    'activeCompanies', v_active_companies,
    'closedCompanies', v_closed_companies,
    'totalAgentCash', v_total_agent_cash,
    'totalCompanyValuation', v_total_company_valuation,
    'bankruptcies', v_bankruptcies,
    'companyClosures', v_company_closures,
    'biggestCashGain', v_biggest_cash_gain,
    'biggestCashLoss', v_biggest_cash_loss,
    'newestRivalry', v_newest_rivalry,
    'highestIntensityRivalry', v_highest_intensity_rivalry,
    'closestToBankruptcyAgent', v_closest_to_bankruptcy_agent,
    'mostInteractedCompany', v_most_interacted_company
  );

  insert into public.daily_market_closes (
    market_date, active_agents, bankrupt_agents, active_companies, closed_companies,
    total_agent_cash, total_company_valuation, bankruptcies, company_closures,
    biggest_cash_gain, biggest_cash_loss, newest_rivalry, highest_intensity_rivalry,
    closest_to_bankruptcy_agent, most_interacted_company, summary, generated_at
  )
  values (
    p_market_date, v_active_agents, v_bankrupt_agents, v_active_companies, v_closed_companies,
    v_total_agent_cash, v_total_company_valuation, v_bankruptcies, v_company_closures,
    v_biggest_cash_gain, v_biggest_cash_loss, v_newest_rivalry, v_highest_intensity_rivalry,
    v_closest_to_bankruptcy_agent, v_most_interacted_company, v_summary, now()
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
    biggest_cash_gain = excluded.biggest_cash_gain,
    biggest_cash_loss = excluded.biggest_cash_loss,
    newest_rivalry = excluded.newest_rivalry,
    highest_intensity_rivalry = excluded.highest_intensity_rivalry,
    closest_to_bankruptcy_agent = excluded.closest_to_bankruptcy_agent,
    most_interacted_company = excluded.most_interacted_company,
    summary = excluded.summary,
    generated_at = excluded.generated_at;

  return v_summary;
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
  v_rejected_offer_count integer := 0;
  v_rivalry_intensity integer;
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
      perform public.record_market_cash_movement(p_agent_id, null, 'agent', p_agent_id, v_agent.name, -1000, v_reason, v_event_type, v_created_id);
      perform public.record_market_cash_movement(p_agent_id, v_created_id, 'company', v_created_id, v_name, 1000, v_reason, v_event_type, v_created_id);

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
      perform public.record_market_cash_movement(p_agent_id, v_company_a.id, 'agent', p_agent_id, v_agent.name, -v_amount, v_reason, v_event_type, v_created_id);
      perform public.record_market_cash_movement(p_agent_id, v_company_a.id, 'company', v_company_a.id, v_company_a.name, v_amount, v_reason, v_event_type, v_created_id);

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
      select count(*)::integer into v_rejected_offer_count
      from public.acquisitions
      where acquirer_company_id = v_company_a_id and target_company_id = v_company_b_id and status = 'rejected';
      select r.intensity into v_rivalry_intensity
      from public.rivalries r
      where r.agent_a_id = least(coalesce(v_company_a.successor_agent_id, v_company_a.founder_agent_id), coalesce(v_company_b.successor_agent_id, v_company_b.founder_agent_id))
        and r.agent_b_id = greatest(coalesce(v_company_a.successor_agent_id, v_company_a.founder_agent_id), coalesce(v_company_b.successor_agent_id, v_company_b.founder_agent_id))
      order by r.intensity desc, r.updated_at desc
      limit 1;
      insert into public.acquisitions (acquirer_company_id, target_company_id, offer_amount, status)
      values (v_company_a_id, v_company_b_id, v_offer_amount, 'pending') returning id into v_created_id;
      v_event_type := 'acquisition_offered'; v_event_company_id := v_company_a.id;
      v_message := public.acquisition_phrase(
        case
          when v_rivalry_intensity is not null then 'offered_rivalry'
          when v_rejected_offer_count > 0 then 'offered_after_rejections'
          else 'offered_first_time'
        end,
        v_company_a.name,
        v_company_b.name,
        v_offer_amount,
        v_rejected_offer_count,
        v_rivalry_intensity
      );

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
  v_rivalry_intensity integer;
  v_rejected_offer_count integer := 0;
begin
  if v_reason = '' then raise exception 'reason is required'; end if;

  select * into v_acquisition
  from public.acquisitions
  where id = p_acquisition_id and status = 'pending'
  for update;
  if not found then raise exception 'pending acquisition does not exist'; end if;

  select * into v_acquirer
  from public.companies where id = v_acquisition.acquirer_company_id and status = 'active'
  for update;
  if not found then raise exception 'acquirer company does not exist'; end if;
  select * into v_target
  from public.companies where id = v_acquisition.target_company_id and status = 'active'
  for update;
  if not found then raise exception 'target company does not exist'; end if;
  if coalesce(v_target.successor_agent_id, v_target.founder_agent_id) <> p_target_agent_id then
    raise exception 'agent does not control the target company';
  end if;
  select * into v_target_agent from public.agents where id = p_target_agent_id;

  select r.intensity into v_rivalry_intensity
  from public.rivalries r
  where r.agent_a_id = least(coalesce(v_acquirer.successor_agent_id, v_acquirer.founder_agent_id), coalesce(v_target.successor_agent_id, v_target.founder_agent_id))
    and r.agent_b_id = greatest(coalesce(v_acquirer.successor_agent_id, v_acquirer.founder_agent_id), coalesce(v_target.successor_agent_id, v_target.founder_agent_id))
  order by r.intensity desc, r.updated_at desc
  limit 1;

  select count(*)::integer into v_rejected_offer_count
  from public.acquisitions
  where acquirer_company_id = v_acquirer.id and target_company_id = v_target.id and status = 'rejected';

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
      v_message := public.acquisition_phrase(
        case when v_rivalry_intensity is not null then 'accepted_rivalry' else 'accepted_plain' end,
        v_acquirer.name,
        v_target.name,
        v_acquisition.offer_amount,
        v_rejected_offer_count,
        v_rivalry_intensity
      );
      perform public.record_market_cash_movement(p_target_agent_id, v_acquirer.id, 'company', v_acquirer.id, v_acquirer.name, -v_acquisition.offer_amount, v_reason, 'acquisition_decision', v_acquisition.id);
      perform public.record_market_cash_movement(p_target_agent_id, v_target.id, 'company', v_target.id, v_target.name, v_acquisition.offer_amount, v_reason, 'acquisition_decision', v_acquisition.id);

    when 'reject' then
      update public.acquisitions
      set status = 'rejected', resolved_at = now()
      where id = v_acquisition.id;
      v_message := public.acquisition_phrase(
        case when v_rivalry_intensity is not null then 'rejected_rivalry' else 'rejected_plain' end,
        v_acquirer.name,
        v_target.name,
        v_acquisition.offer_amount,
        v_rejected_offer_count,
        v_rivalry_intensity
      );

    when 'counter' then
      v_counter_amount := (p_decision ->> 'counter_amount')::numeric;
      if v_counter_amount is null or v_counter_amount <= 0 then
        raise exception 'counter amount must be positive';
      end if;
      update public.acquisitions
      set offer_amount = v_counter_amount, created_at = now()
      where id = v_acquisition.id;
      v_message := public.acquisition_phrase(
        case when v_rivalry_intensity is not null then 'counter_rivalry' else 'counter_plain' end,
        v_acquirer.name,
        v_target.name,
        v_counter_amount,
        v_rejected_offer_count,
        v_rivalry_intensity
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
  v_burned numeric(20, 2);
begin
  if p_amount <= 0 then raise exception 'burn amount must be positive'; end if;
  select * into v_agent from public.agents
  where id = p_agent_id and is_npc and status <> 'bankrupt'
  for update;
  if not found then raise exception 'active NPC does not exist'; end if;

  v_remaining := greatest(0, v_agent.cash - p_amount);
  v_burned := v_agent.cash - v_remaining;
  update public.agents set cash = v_remaining where id = p_agent_id;
  perform public.record_market_cash_movement(p_agent_id, null, 'agent', p_agent_id, v_agent.name, -v_burned, p_reason, 'cash_burn', null);

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

revoke all on function public.record_market_cash_movement(uuid, uuid, text, uuid, text, numeric, text, text, uuid) from public, anon, authenticated;
revoke all on function public.acquisition_phrase(text, text, text, numeric, integer, integer) from public, anon, authenticated;
revoke all on function public.snapshot_daily_market_close(date) from public, anon, authenticated;
revoke all on function public.execute_agent_action(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_acquisition(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.npc_apply_burn(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.record_market_cash_movement(uuid, uuid, text, uuid, text, numeric, text, text, uuid) to service_role;
grant execute on function public.acquisition_phrase(text, text, text, numeric, integer, integer) to service_role;
grant execute on function public.snapshot_daily_market_close(date) to service_role;
grant execute on function public.execute_agent_action(uuid, jsonb) to service_role;
grant execute on function public.resolve_acquisition(uuid, uuid, jsonb) to service_role;
grant execute on function public.npc_apply_burn(uuid, numeric, text) to service_role;

commit;
