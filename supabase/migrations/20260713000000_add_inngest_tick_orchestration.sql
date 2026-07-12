begin;

alter table public.tick_runs
  add column phase text not null default 'real_agents'
    check (phase in ('real_agents', 'npc_agents', 'finalizing', 'completed', 'failed'));

alter table public.agent_tick_actions
  add column payload jsonb not null default '{}'::jsonb;

create or replace function public.execute_tick_agent_action(
  p_tick_run_id uuid,
  p_agent_id uuid,
  p_action jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation public.agent_tick_actions%rowtype;
  v_result jsonb;
begin
  select * into v_reservation from public.agent_tick_actions
  where tick_run_id = p_tick_run_id and agent_id = p_agent_id for update;
  if not found then raise exception 'tick action reservation does not exist'; end if;
  if v_reservation.completed_at is not null then
    return jsonb_build_object('ok', v_reservation.succeeded, 'already_completed', true, 'action', v_reservation.action);
  end if;
  v_result := public.execute_agent_action(p_agent_id, p_action);
  update public.agent_tick_actions set
    action = p_action ->> 'action', succeeded = true, error = null, completed_at = now()
  where id = v_reservation.id;
  return v_result || jsonb_build_object('already_completed', false);
end;
$$;

create or replace function public.resolve_tick_acquisition(
  p_tick_run_id uuid,
  p_agent_id uuid,
  p_acquisition_id uuid,
  p_decision jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation public.agent_tick_actions%rowtype;
  v_result jsonb;
  v_action text := 'acquisition_' || coalesce(p_decision ->> 'decision', 'unknown');
begin
  select * into v_reservation from public.agent_tick_actions
  where tick_run_id = p_tick_run_id and agent_id = p_agent_id for update;
  if not found then raise exception 'tick action reservation does not exist'; end if;
  if v_reservation.completed_at is not null then
    return jsonb_build_object('ok', v_reservation.succeeded, 'already_completed', true, 'action', v_reservation.action);
  end if;
  v_result := public.resolve_acquisition(p_acquisition_id, p_agent_id, p_decision);
  update public.agent_tick_actions set
    action = v_action, succeeded = true, error = null, completed_at = now()
  where id = v_reservation.id;
  return v_result || jsonb_build_object('already_completed', false, 'action', v_action);
end;
$$;

create or replace function public.execute_tick_npc_special(
  p_tick_run_id uuid,
  p_agent_id uuid,
  p_action text,
  p_reason text,
  p_amount numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation public.agent_tick_actions%rowtype;
  v_result jsonb;
begin
  select * into v_reservation from public.agent_tick_actions
  where tick_run_id = p_tick_run_id and agent_id = p_agent_id for update;
  if not found then raise exception 'tick action reservation does not exist'; end if;
  if v_reservation.completed_at is not null then
    return jsonb_build_object('ok', v_reservation.succeeded, 'already_completed', true, 'action', v_reservation.action);
  end if;
  if p_action = 'create_job' then
    v_result := public.npc_create_job(p_agent_id, p_reason);
  elsif p_action = 'struggle' then
    v_result := public.npc_apply_burn(p_agent_id, p_amount, p_reason);
  else
    raise exception 'unsupported NPC special action: %', p_action;
  end if;
  update public.agent_tick_actions set
    action = p_action, succeeded = true, error = null, completed_at = now()
  where id = v_reservation.id;
  update public.npc_profiles set ticks_acted = ticks_acted + 1 where agent_id = p_agent_id;
  return v_result || jsonb_build_object('already_completed', false);
end;
$$;

create or replace function public.execute_tick_npc_action(
  p_tick_run_id uuid,
  p_agent_id uuid,
  p_action jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_reservation public.agent_tick_actions%rowtype;
  v_result jsonb;
begin
  select * into v_reservation from public.agent_tick_actions
  where tick_run_id = p_tick_run_id and agent_id = p_agent_id for update;
  if not found then raise exception 'tick action reservation does not exist'; end if;
  if v_reservation.completed_at is not null then
    return jsonb_build_object('ok', v_reservation.succeeded, 'already_completed', true, 'action', v_reservation.action);
  end if;
  v_result := public.execute_agent_action(p_agent_id, p_action);
  update public.agent_tick_actions set
    action = p_action ->> 'action', succeeded = true, error = null, completed_at = now()
  where id = v_reservation.id;
  update public.npc_profiles set ticks_acted = ticks_acted + 1 where agent_id = p_agent_id;
  return v_result || jsonb_build_object('already_completed', false);
end;
$$;

create or replace function public.fail_tick_agent_action(
  p_tick_run_id uuid,
  p_agent_id uuid,
  p_action text,
  p_error text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_rows integer;
begin
  update public.agent_tick_actions set
    action = coalesce(nullif(p_action, ''), 'unknown'),
    succeeded = false,
    error = left(p_error, 4000),
    completed_at = now()
  where tick_run_id = p_tick_run_id and agent_id = p_agent_id and completed_at is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.advance_tick_phase(
  p_tick_run_id uuid,
  p_expected_phase text,
  p_next_phase text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_run public.tick_runs%rowtype;
  v_is_npc boolean := p_expected_phase = 'npc_agents';
begin
  select * into v_run from public.tick_runs where id = p_tick_run_id for update;
  if not found or v_run.phase <> p_expected_phase or v_run.status <> 'running' then return false; end if;
  if exists (
    select 1 from public.agent_tick_actions a
    join public.agents agent on agent.id = a.agent_id
    where a.tick_run_id = p_tick_run_id
      and agent.is_npc = v_is_npc
      and a.completed_at is null
  ) then return false; end if;
  update public.tick_runs set phase = p_next_phase where id = p_tick_run_id;
  return true;
end;
$$;

create or replace function public.finalize_inngest_tick(
  p_tick_run_id uuid,
  p_tick_key timestamptz,
  p_snapshot_error text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_run public.tick_runs%rowtype;
  v_processed integer;
  v_action_counts jsonb;
  v_errors jsonb;
  v_summary jsonb;
begin
  select * into v_run from public.tick_runs where id = p_tick_run_id for update;
  if not found then raise exception 'tick run does not exist'; end if;
  if v_run.status = 'completed' then
    return jsonb_build_object('tickKey', p_tick_key, 'processed', v_run.processed_count, 'actionCounts', v_run.action_counts, 'errors', v_run.errors, 'alreadyCompleted', true);
  end if;
  if v_run.phase <> 'finalizing' then raise exception 'tick run is not ready to finalize'; end if;

  select count(*)::integer into v_processed from public.agent_tick_actions where tick_run_id = p_tick_run_id;
  select coalesce(jsonb_object_agg(action, count), '{}'::jsonb) into v_action_counts
  from (
    select action, count(*)::integer as count from public.agent_tick_actions
    where tick_run_id = p_tick_run_id and succeeded = true group by action
  ) counts;
  select coalesce(jsonb_agg(jsonb_build_object(
    'agentId', agent_id, 'phase', case when agent.is_npc then 'npc' else 'action' end,
    'message', coalesce(a.error, 'Unknown action error')
  )), '[]'::jsonb) into v_errors
  from public.agent_tick_actions a join public.agents agent on agent.id = a.agent_id
  where a.tick_run_id = p_tick_run_id and a.succeeded = false;
  if p_snapshot_error is not null then
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('phase', 'valuation_snapshot', 'message', p_snapshot_error));
  end if;
  v_summary := jsonb_build_object(
    'tickKey', p_tick_key, 'batchSize', v_processed, 'processed', v_processed,
    'actionCounts', v_action_counts, 'errors', v_errors
  );
  update public.tick_runs set status = 'completed', phase = 'completed', processed_count = v_processed,
    action_counts = v_action_counts, errors = v_errors, completed_at = now() where id = p_tick_run_id;
  insert into public.system_logs (level, message, metadata) values (
    case when jsonb_array_length(v_errors) > 0 then 'warning' else 'info' end,
    format('Tick processed %s agents with %s errors.', v_processed, jsonb_array_length(v_errors)),
    v_summary
  );
  return v_summary || jsonb_build_object('alreadyCompleted', false);
end;
$$;

revoke all on function public.execute_tick_agent_action(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.execute_tick_npc_action(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.resolve_tick_acquisition(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.execute_tick_npc_special(uuid, uuid, text, text, numeric) from public, anon, authenticated;
revoke all on function public.fail_tick_agent_action(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.advance_tick_phase(uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_inngest_tick(uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.execute_tick_agent_action(uuid, uuid, jsonb) to service_role;
grant execute on function public.execute_tick_npc_action(uuid, uuid, jsonb) to service_role;
grant execute on function public.resolve_tick_acquisition(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.execute_tick_npc_special(uuid, uuid, text, text, numeric) to service_role;
grant execute on function public.fail_tick_agent_action(uuid, uuid, text, text) to service_role;
grant execute on function public.advance_tick_phase(uuid, text, text) to service_role;
grant execute on function public.finalize_inngest_tick(uuid, timestamptz, text) to service_role;

commit;
