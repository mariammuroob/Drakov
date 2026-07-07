begin;

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
  v_tick_unit text;
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
  v_tick_unit := case when v_ticks = 1 then 'tick' else 'ticks' end;

  if new.type = 'investment' then
    new.message := format(
      '%s %s after their last clash, %s challenged %s again over %s. %s',
      v_ticks, v_tick_unit, v_actor_name, v_counterparty_name,
      coalesce(v_company_name, 'the same company'), new.message
    );
  elsif new.type = 'acquisition_offered' then
    new.message := format(
      '%s %s after their rivalry began, %s made another move against %s. %s',
      v_ticks, v_tick_unit, v_actor_name, v_counterparty_name, new.message
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

commit;
