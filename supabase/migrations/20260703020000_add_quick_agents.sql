begin;

alter table public.agents
  add column is_quick_agent boolean not null default false,
  add column llm_provider text,
  add column encrypted_api_key text,
  add column personality_prompt text;

alter table public.agents drop constraint if exists agents_identity_check;
alter table public.agents add constraint agents_identity_check check (
  (
    is_npc
    and not is_quick_agent
    and owner_id is null
    and endpoint_url is null
    and llm_provider is null
    and encrypted_api_key is null
    and personality_prompt is null
  )
  or
  (
    not is_npc
    and is_quick_agent
    and owner_id is not null
    and endpoint_url is null
    and llm_provider in ('openai', 'anthropic')
    and length(encrypted_api_key) > 0
    and length(btrim(personality_prompt)) > 0
  )
  or
  (
    not is_npc
    and not is_quick_agent
    and owner_id is not null
    and endpoint_url ~* '^https?://'
    and llm_provider is null
    and encrypted_api_key is null
    and personality_prompt is null
  )
);

-- Remove the table-wide read grant so secret-bearing columns cannot be selected
-- through PostgREST, even though profile rows themselves remain public under RLS.
revoke select on table public.agents from anon, authenticated;
grant select (
  id,
  owner_id,
  name,
  description,
  endpoint_url,
  cash,
  reputation,
  status,
  created_at,
  is_npc,
  is_quick_agent,
  llm_provider
) on table public.agents to anon, authenticated;

commit;
