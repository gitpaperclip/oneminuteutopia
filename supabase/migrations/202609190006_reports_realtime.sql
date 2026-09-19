-- Let the local demo worker subscribe to new civic reports. No-op when the
-- supabase_realtime publication is absent (local pglite tests).
begin;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reports'
  ) then
    return;
  end if;
  execute 'alter publication supabase_realtime add table public.reports';
exception
  when undefined_table then
    null;
  when others then
    raise notice 'Skipping supabase_realtime publication (%).', sqlerrm;
end $$;

commit;
