begin;

grant execute on function public.moderate_public_text(text) to authenticated;

commit;
