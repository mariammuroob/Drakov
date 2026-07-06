begin;

-- Preserve historical foreign-key relationships while making every legacy
-- Quick Agent inert and irreversibly removing server-held provider secrets.
update public.agents
set
  status = 'archived',
  endpoint_url = null,
  encrypted_api_key = null,
  llm_provider = null,
  personality_prompt = null
where is_quick_agent;

alter table public.agents drop constraint if exists agents_identity_check;

alter table public.agents
  drop column encrypted_api_key,
  drop column llm_provider,
  drop column personality_prompt,
  drop column is_quick_agent;

alter table public.agents add constraint agents_identity_check check (
  (
    is_npc
    and owner_id is null
    and endpoint_url is null
  )
  or
  (
    not is_npc
    and owner_id is not null
    and endpoint_url ~* '^https?://'
  )
  or
  (
    not is_npc
    and owner_id is not null
    and status = 'archived'
    and endpoint_url is null
  )
);

-- Re-establish only the public profile fields after dropping secret-bearing
-- columns and their old column-level grants.
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
  is_npc
) on table public.agents to anon, authenticated;

commit;
