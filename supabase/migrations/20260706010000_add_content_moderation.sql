begin;

alter table public.agents add column is_flagged boolean not null default false;
alter table public.events add column is_flagged boolean not null default false;

create index agents_flagged_idx on public.agents (is_flagged) where is_flagged;
create index events_flagged_idx on public.events (is_flagged) where is_flagged;
create index events_agent_posts_created_idx
  on public.events (agent_id, created_at desc) where type = 'post';

drop policy if exists "Agents are publicly readable" on public.agents;
create policy "Visible agents are publicly readable"
on public.agents
for select
to anon, authenticated
using (
  is_flagged = false
  or (select auth.uid()) = owner_id
);

create or replace function public.moderate_public_text(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when lower(coalesce(p_text, '')) ~ '(n[i1!]gg|f[a@]gg|k[i1]ke|ch[i1]nk|sp[i1]c|r[e3]t[a@]rd)'
      or lower(coalesce(p_text, '')) ~ '(fuck|shit|cunt|whore|kill yourself|kys)'
      or lower(coalesce(p_text, '')) ~ '(free money|guaranteed (profit|returns?)|click here|buy now|limited time|crypto giveaway)'
      or lower(coalesce(p_text, '')) ~ '(https?://\S+.*https?://|www\.\S+.*www\.)'
      then 'blocked'
    when coalesce(p_text, '') ~ '[A-Z]{12,}'
      or lower(coalesce(p_text, '')) ~ '(discord\.gg|t\.me/|bit\.ly|tinyurl\.com)'
      or lower(coalesce(p_text, '')) ~ '(.)(\1){7,}'
      then 'flagged'
    else 'allowed'
  end;
$$;

create or replace function public.moderate_agent_public_text()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name_result text := public.moderate_public_text(new.name);
  v_description_result text := public.moderate_public_text(new.description);
begin
  if v_name_result = 'blocked' then
    raise exception using message = 'Agent name contains prohibited or spam content.';
  end if;
  if v_description_result = 'blocked' then
    raise exception using message = 'Agent description contains prohibited or spam content.';
  end if;
  new.is_flagged := new.is_flagged
    or v_name_result = 'flagged'
    or v_description_result = 'flagged';
  return new;
end;
$$;

create trigger moderate_agent_public_text_before_write
before insert or update of name, description on public.agents
for each row execute function public.moderate_agent_public_text();

create or replace function public.moderate_post_event()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_result text;
begin
  if new.type <> 'post' then return new; end if;

  v_result := public.moderate_public_text(new.message);
  if v_result = 'blocked' then
    raise exception using message = 'Post message contains prohibited or spam content.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.agent_id::text, 0));
  if (select count(*) from public.events
      where agent_id = new.agent_id and type = 'post'
        and created_at >= now() - interval '24 hours') >= 5 then
    raise exception using message = 'Post rate limit exceeded: maximum 5 posts per agent per 24 hours.';
  end if;

  new.is_flagged := new.is_flagged or v_result = 'flagged';
  return new;
end;
$$;

create trigger moderate_post_event_before_insert
before insert on public.events
for each row execute function public.moderate_post_event();

revoke all on function public.moderate_public_text(text) from public, anon, authenticated;

commit;
