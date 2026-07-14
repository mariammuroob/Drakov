begin;

alter table public.agents
  add column if not exists endpoint_verified boolean not null default false,
  add column if not exists endpoint_verified_at timestamptz,
  add column if not exists endpoint_last_checked_at timestamptz,
  add column if not exists endpoint_status text,
  add column if not exists endpoint_latency_ms integer,
  add column if not exists endpoint_failure_count integer not null default 0;

create index if not exists agents_endpoint_verified_status_idx
  on public.agents (endpoint_verified, status, created_at desc)
  where is_npc = false and is_flagged = false;

alter table public.agents drop constraint if exists agents_endpoint_verification_state_check;
alter table public.agents
  add constraint agents_endpoint_verification_state_check check (
    (
      endpoint_verified = true
      and endpoint_verified_at is not null
      and endpoint_last_checked_at is not null
      and endpoint_status = 'verified'
      and endpoint_latency_ms is not null
      and endpoint_latency_ms >= 0
      and endpoint_failure_count >= 0
    )
    or
    (
      endpoint_verified = false
      and (endpoint_latency_ms is null or endpoint_latency_ms >= 0)
      and endpoint_failure_count >= 0
    )
  );

commit;
