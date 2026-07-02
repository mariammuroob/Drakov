begin;

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  endpoint_url text not null check (endpoint_url ~* '^https?://'),
  cash numeric(20, 2) not null default 10000 check (cash >= 0),
  reputation integer not null default 50 check (reputation between 0 and 100),
  status text not null default 'independent' check (length(btrim(status)) > 0),
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  founder_agent_id uuid not null references public.agents (id),
  name text not null check (length(btrim(name)) > 0),
  market text not null check (length(btrim(market)) > 0),
  cash numeric(20, 2) not null check (cash >= 0),
  revenue numeric(20, 2) not null default 0 check (revenue >= 0),
  valuation numeric(20, 2) not null default 0 check (valuation >= 0),
  reputation integer not null default 50 check (reputation between 0 and 100),
  created_at timestamptz not null default now()
);

create table public.employments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id),
  company_id uuid not null references public.companies (id),
  role text not null check (length(btrim(role)) > 0),
  salary numeric(20, 2) not null check (salary >= 0),
  equity_pct numeric(7, 4) not null check (equity_pct between 0 and 100),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint employments_valid_dates check (ended_at is null or ended_at >= started_at)
);

create table public.investments (
  id uuid primary key default gen_random_uuid(),
  investor_agent_id uuid not null references public.agents (id),
  company_id uuid not null references public.companies (id),
  amount numeric(20, 2) not null check (amount > 0),
  ownership_pct numeric(7, 4) not null check (ownership_pct > 0 and ownership_pct <= 100),
  created_at timestamptz not null default now()
);

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  company_a_id uuid not null references public.companies (id),
  company_b_id uuid not null references public.companies (id),
  created_at timestamptz not null default now(),
  constraint partnerships_distinct_companies check (company_a_id <> company_b_id)
);

create table public.acquisitions (
  id uuid primary key default gen_random_uuid(),
  acquirer_company_id uuid not null references public.companies (id),
  target_company_id uuid not null references public.companies (id),
  offer_amount numeric(20, 2) not null check (offer_amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint acquisitions_distinct_companies
    check (acquirer_company_id <> target_company_id),
  constraint acquisitions_resolution_matches_status check (
    (status = 'pending' and resolved_at is null)
    or
    (status <> 'pending' and resolved_at is not null and resolved_at >= created_at)
  )
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  title text not null check (length(btrim(title)) > 0),
  salary numeric(20, 2) not null check (salary >= 0),
  equity_pct numeric(7, 4) not null check (equity_pct between 0 and 100),
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (length(btrim(type)) > 0),
  agent_id uuid references public.agents (id),
  company_id uuid references public.companies (id),
  message text not null check (length(btrim(message)) > 0),
  created_at timestamptz not null default now()
);

create index agents_owner_id_idx on public.agents (owner_id);
create index companies_founder_agent_id_idx on public.companies (founder_agent_id);
create index employments_agent_id_idx on public.employments (agent_id);
create index employments_company_id_idx on public.employments (company_id);
create index investments_investor_agent_id_idx on public.investments (investor_agent_id);
create index investments_company_id_idx on public.investments (company_id);
create index partnerships_company_a_id_idx on public.partnerships (company_a_id);
create index partnerships_company_b_id_idx on public.partnerships (company_b_id);
create unique index partnerships_unique_company_pair_idx
  on public.partnerships (
    least(company_a_id, company_b_id),
    greatest(company_a_id, company_b_id)
  );
create index acquisitions_acquirer_company_id_idx
  on public.acquisitions (acquirer_company_id);
create index acquisitions_target_company_id_idx
  on public.acquisitions (target_company_id);
create index jobs_company_id_idx on public.jobs (company_id);
create index events_agent_id_idx on public.events (agent_id);
create index events_company_id_idx on public.events (company_id);
create index events_created_at_desc_idx on public.events (created_at desc);

commit;
