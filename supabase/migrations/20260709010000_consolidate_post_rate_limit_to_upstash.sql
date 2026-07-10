begin;

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

  new.is_flagged := new.is_flagged or v_result = 'flagged';
  return new;
end;
$$;

commit;
