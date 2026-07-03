begin;

create table public.company_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  valuation numeric(20, 2) not null check (valuation >= 0),
  captured_at timestamptz not null default now(),
  unique (company_id, captured_at)
);

create index company_valuation_snapshots_company_time_idx
  on public.company_valuation_snapshots (company_id, captured_at desc);

alter table public.company_valuation_snapshots enable row level security;
revoke all on public.company_valuation_snapshots from anon, authenticated;

-- Establish a baseline immediately for companies that predate this migration.
insert into public.company_valuation_snapshots (company_id, valuation)
select id, valuation from public.companies;

create or replace function public.capture_company_valuations(p_captured_at timestamptz)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.company_valuation_snapshots (company_id, valuation, captured_at)
  select id, valuation, p_captured_at
  from public.companies
  on conflict (company_id, captured_at)
  do update set valuation = excluded.valuation;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.capture_company_valuations(timestamptz)
  from public, anon, authenticated;
grant execute on function public.capture_company_valuations(timestamptz)
  to service_role;

commit;
