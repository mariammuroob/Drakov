begin;

create or replace function public.sanitize_public_text_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'agents' then
    new.name := btrim(regexp_replace(regexp_replace(new.name, '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
    new.description := btrim(regexp_replace(regexp_replace(new.description, '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
    if new.name = '' or length(new.name) > 100 then raise exception 'agent name must be between 1 and 100 characters'; end if;
    if new.description = '' or length(new.description) > 1000 then raise exception 'agent description must be between 1 and 1000 characters'; end if;
  elsif tg_table_name = 'companies' then
    new.name := btrim(regexp_replace(regexp_replace(new.name, '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
    new.market := btrim(regexp_replace(regexp_replace(new.market, '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
    if new.name = '' or length(new.name) > 100 then raise exception 'company name must be between 1 and 100 characters'; end if;
    if new.market = '' or length(new.market) > 100 then raise exception 'company market must be between 1 and 100 characters'; end if;
  elsif tg_table_name = 'events' then
    new.message := btrim(regexp_replace(regexp_replace(new.message, '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
    new.reason := btrim(regexp_replace(regexp_replace(new.reason, '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'), '</?script[^>]*>', '', 'gi'));
    if new.message = '' or length(new.message) > 4000 then raise exception 'event message must be between 1 and 4000 characters'; end if;
    if length(new.reason) > 1000 then raise exception 'event reason exceeds 1000 characters'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sanitize_agent_public_text on public.agents;
create trigger sanitize_agent_public_text before insert or update of name, description on public.agents
for each row execute function public.sanitize_public_text_fields();
drop trigger if exists sanitize_company_public_text on public.companies;
create trigger sanitize_company_public_text before insert or update of name, market on public.companies
for each row execute function public.sanitize_public_text_fields();
drop trigger if exists sanitize_event_public_text on public.events;
create trigger sanitize_event_public_text before insert or update of message, reason on public.events
for each row execute function public.sanitize_public_text_fields();

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
begin
  v_reason := btrim(regexp_replace(regexp_replace(
    coalesce(p_action ->> 'reason', ''),
    '<script[^>]*>.*?</script[[:space:]]*>', '', 'gis'
  ), '</?script[^>]*>', '', 'gi'));
  if v_reason = '' then raise exception 'reason is required'; end if;
  if length(v_reason) > 1000 then raise exception 'reason exceeds 1000 characters'; end if;

  -- This locked row is the authoritative agent state for the mutation below.
  select * into v_agent from public.agents where id = p_agent_id for update;
  if not found then raise exception 'agent does not exist'; end if;
  if v_agent.status = 'archived' then raise exception 'agent is not active'; end if;

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
      perform 1 from public.companies where id = v_job.company_id for update;
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
      select * into v_company_a from public.companies where id = v_job.company_id;
      v_event_type := 'job_filled'; v_event_company_id := v_job.company_id;
      v_message := format('%s joined %s as %s.', v_agent.name, v_company_a.name, v_job.title);

    when 'invest' then
      v_company_a_id := nullif(p_action ->> 'company_id', '')::uuid;
      v_amount := (p_action ->> 'amount')::numeric;
      if v_amount is null or v_amount <= 0 then raise exception 'amount must be positive'; end if;
      select * into v_company_a from public.companies where id = v_company_a_id for update;
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
      perform 1 from public.companies where id in (v_company_a_id, v_company_b_id) order by id for update;
      select * into v_company_a from public.companies where id = v_company_a_id;
      if not found then raise exception 'first company does not exist'; end if;
      select * into v_company_b from public.companies where id = v_company_b_id;
      if not found then raise exception 'second company does not exist'; end if;
      if v_company_a.founder_agent_id <> p_agent_id and v_company_b.founder_agent_id <> p_agent_id then
        raise exception 'agent must currently own one partner company';
      end if;
      if exists (select 1 from public.partnerships where (company_a_id = v_company_a_id and company_b_id = v_company_b_id) or (company_a_id = v_company_b_id and company_b_id = v_company_a_id)) then
        raise exception 'partnership already exists';
      end if;
      insert into public.partnerships (company_a_id, company_b_id) values (v_company_a_id, v_company_b_id) returning id into v_created_id;
      v_event_type := 'partnership';
      v_event_company_id := case when v_company_a.founder_agent_id = p_agent_id then v_company_a.id else v_company_b.id end;
      v_message := format('%s partnered with %s.', v_company_a.name, v_company_b.name);

    when 'acquire' then
      v_company_a_id := nullif(p_action ->> 'acquirer_company_id', '')::uuid;
      v_company_b_id := nullif(p_action ->> 'target_company_id', '')::uuid;
      v_offer_amount := (p_action ->> 'offer_amount')::numeric;
      if v_company_a_id = v_company_b_id then raise exception 'a company cannot acquire itself'; end if;
      if v_offer_amount is null or v_offer_amount <= 0 then raise exception 'offer amount must be positive'; end if;
      perform 1 from public.companies where id in (v_company_a_id, v_company_b_id) order by id for update;
      select * into v_company_a from public.companies where id = v_company_a_id;
      if not found then raise exception 'acquirer company does not exist'; end if;
      select * into v_company_b from public.companies where id = v_company_b_id;
      if not found then raise exception 'target company does not exist'; end if;
      if v_company_a.founder_agent_id <> p_agent_id then raise exception 'agent must currently own the acquirer company'; end if;
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
  return jsonb_build_object('ok', true, 'action', v_action, 'created_id', v_created_id, 'message', v_message, 'reason', v_reason);
end;
$$;

revoke all on function public.execute_agent_action(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.execute_agent_action(uuid, jsonb) to service_role;

commit;
