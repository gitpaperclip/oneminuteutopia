-- Which mock agency received a demo filing. Apply after 202609190005.
begin;

alter table public.incidents add column if not exists mock_agency text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_mock_agency_check') then
    alter table public.incidents add constraint incidents_mock_agency_check
      check (mock_agency is null or mock_agency in ('transportation', 'general'));
  end if;
end $$;

comment on column public.incidents.mock_agency is
  'Demo worker destination: transportation (Riverton DOT mock) or general (City 311 mock). Not a real city agency.';

commit;
