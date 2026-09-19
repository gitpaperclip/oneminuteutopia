-- Adds normalized image context and the incident aggregation fields used by the
-- public incident feed. Apply after 202609190000 and 202609190001.
begin;

alter table public.image_analyses add column if not exists incident_type text;
alter table public.image_analyses add column if not exists context_summary text;
alter table public.image_analyses add column if not exists context_tags text[] not null default '{}';
alter table public.image_analyses add column if not exists tags text[] not null default '{}';

update public.image_analyses set incident_type = case category
  when 'roads_and_sidewalks' then 'roads_and_sidewalks_unspecified'
  when 'traffic_signals_and_streetlights' then 'traffic_signals_and_streetlights_unspecified'
  when 'trash_and_sanitation' then 'trash_and_sanitation_unspecified'
  when 'water_drainage_and_sewage' then 'water_drainage_and_sewage_unspecified'
  when 'trees_and_public_spaces' then 'trees_and_public_spaces_unspecified'
  when 'buildings_and_construction' then 'buildings_and_construction_unspecified'
  when 'electricity_and_gas' then 'electricity_and_gas_unspecified'
  when 'animals' then 'animals_unspecified'
  when 'fire_injury_or_immediate_threat' then 'fire_injury_or_immediate_threat_unspecified'
  when 'no_visible_hazard' then 'no_visible_hazard'
  when 'unable_to_assess' then 'unable_to_assess'
  else 'other_hazard'
end where incident_type is null;
update public.image_analyses
  set context_summary = 'Legacy analysis; no image context was captured.'
  where context_summary is null;
update public.image_analyses set tags = array[incident_type] where cardinality(tags) = 0;
alter table public.image_analyses alter column incident_type set not null;
alter table public.image_analyses alter column context_summary set not null;

alter table public.reports add column if not exists incident_type text;
alter table public.reports add column if not exists context_summary text;
alter table public.reports add column if not exists tags text[] not null default '{}';

alter table public.incidents add column if not exists incident_type text;
alter table public.incidents add column if not exists tags text[] not null default '{}';
alter table public.incidents add column if not exists highest_seriousness smallint;
alter table public.incidents add column if not exists average_ai_confidence double precision;
alter table public.incidents add column if not exists ai_evidence_count integer not null default 0;
alter table public.incidents add column if not exists last_reported_at bigint;
alter table public.incidents add column if not exists cluster_radius_m integer not null default 150;

-- Historical records remain queryable and receive broad fallback types.
update public.reports set incident_type = case category
  when 'roads_and_sidewalks' then 'roads_and_sidewalks_unspecified'
  when 'traffic_signals_and_streetlights' then 'traffic_signals_and_streetlights_unspecified'
  when 'trash_and_sanitation' then 'trash_and_sanitation_unspecified'
  when 'water_drainage_and_sewage' then 'water_drainage_and_sewage_unspecified'
  when 'trees_and_public_spaces' then 'trees_and_public_spaces_unspecified'
  when 'buildings_and_construction' then 'buildings_and_construction_unspecified'
  when 'electricity_and_gas' then 'electricity_and_gas_unspecified'
  when 'animals' then 'animals_unspecified'
  when 'fire_injury_or_immediate_threat' then 'fire_injury_or_immediate_threat_unspecified'
  when 'no_visible_hazard' then 'no_visible_hazard'
  when 'unable_to_assess' then 'unable_to_assess'
  else 'other_hazard'
end where incident_type is null;
update public.reports set tags = array[incident_type] where cardinality(tags) = 0;

update public.incidents set incident_type = case category
  when 'roads_and_sidewalks' then 'roads_and_sidewalks_unspecified'
  when 'traffic_signals_and_streetlights' then 'traffic_signals_and_streetlights_unspecified'
  when 'trash_and_sanitation' then 'trash_and_sanitation_unspecified'
  when 'water_drainage_and_sewage' then 'water_drainage_and_sewage_unspecified'
  when 'trees_and_public_spaces' then 'trees_and_public_spaces_unspecified'
  when 'buildings_and_construction' then 'buildings_and_construction_unspecified'
  when 'electricity_and_gas' then 'electricity_and_gas_unspecified'
  when 'animals' then 'animals_unspecified'
  when 'fire_injury_or_immediate_threat' then 'fire_injury_or_immediate_threat_unspecified'
  when 'no_visible_hazard' then 'no_visible_hazard'
  when 'unable_to_assess' then 'unable_to_assess'
  else 'other_hazard'
end where incident_type is null;
update public.incidents set tags = array[incident_type] where cardinality(tags) = 0;
update public.incidents set last_reported_at = updated_at where last_reported_at is null;
update public.incidents set ai_evidence_count = evidence_count
  where average_ai_confidence is not null and ai_evidence_count = 0;

create index if not exists image_analyses_incident_type on public.image_analyses(incident_type);
create index if not exists image_analyses_tags on public.image_analyses using gin(tags);
create index if not exists reports_incident_type on public.reports(incident_type);
create index if not exists reports_tags on public.reports using gin(tags);
create index if not exists incidents_cluster_lookup
  on public.incidents(incident_type, updated_at desc) where latitude is not null and longitude is not null;
create index if not exists incidents_tags on public.incidents using gin(tags);

comment on column public.image_analyses.incident_type is 'Preset normalized subtype produced from visible image evidence.';
comment on column public.image_analyses.context_summary is 'Short model description of visible evidence only.';
comment on column public.image_analyses.tags is 'Normalized incident type plus allowlisted visual context tags.';
comment on table public.incidents is 'Aggregate incident records; evidence_count >= 2 represents a super-report.';

commit;
