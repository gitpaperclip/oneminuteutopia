-- Demo seed for public.incidents + public.reports (and matching sessions / image_analyses).
-- Paste into the Supabase SQL editor AFTER you delete messy live rows.
--
-- IDs are prefixed seedInc / seedRpt / seedSession so you can wipe only this demo later.
-- Report and incident IDs are 21 characters so receipts still load.
--
-- If `npm run worker` is running, the two ready_to_submit pending incidents will be
-- picked up for mock filing (pothole → transportation, streetlight → transportation).

begin;

delete from public.incident_confirmations
  where incident_id like 'seedInc%' or session_id like 'seedSession%';
delete from public.image_analyses
  where image_path like 'https://seed.local/%';
delete from public.reports
  where id like 'seedRpt%';
delete from public.incidents
  where id like 'seedInc%';
delete from public.sessions
  where id like 'seedSession%';

insert into public.sessions (id, created_at, last_seen) values
  ('seedSessionPotholeA0000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('seedSessionPotholeB0000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('seedSessionStLightA0000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('seedSessionStLightB0000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('seedSessionLitterA00000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('seedSessionFireA0000000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('seedSessionDumpingA0000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint),
  ('seedSessionDumpingB0000000000001', (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint);

-- 1) Two nearby pothole reports, overlapping GPS circles, ready for DOT mock filing.
--    case 0.585 + 0.585 → incident_score 0.827775
insert into public.incidents (
  id, category, incident_type, short_label, full_description, tags,
  baltimore_service_candidates, routing_disposition,
  latitude, longitude, location_address, status, severity, credibility_score,
  evidence_count, confirmation_count, highest_seriousness, average_ai_confidence, ai_evidence_count,
  cluster_radius_m, last_reported_at, created_at, updated_at,
  mock_status, mock_error, mock_reference_id, mock_submitted_at, mock_agency,
  incident_score, report_count, government_report_status
) values (
  'seedIncPothole0000001', 'roads_and_sidewalks', 'pothole', 'Roads and sidewalks',
  'Large pothole in the travel lane near Calvert and Madison.',
  array['pothole', 'roadway'],
  array['TRM-Potholes', 'TRM-Pickup Pothole'], '311',
  39.29048, -76.61215, 'Calvert St & Madison St, Baltimore', 'reported', 'normal', 0,
  2, 1, 6, 0.95, 2,
  30, (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint - 3600000,
  (extract(epoch from now()) * 1000)::bigint,
  'pending', null, null, null, null,
  0.827775, 2, 'ready_to_submit'
);

-- 2) Two streetlight outage reports, ready for DOT mock filing.
--    case 0.576 + 0.57 → incident_score 0.81768
insert into public.incidents (
  id, category, incident_type, short_label, full_description, tags,
  baltimore_service_candidates, routing_disposition,
  latitude, longitude, location_address, status, severity, credibility_score,
  evidence_count, confirmation_count, highest_seriousness, average_ai_confidence, ai_evidence_count,
  cluster_radius_m, last_reported_at, created_at, updated_at,
  mock_status, mock_error, mock_reference_id, mock_submitted_at, mock_agency,
  incident_score, report_count, government_report_status
) values (
  'seedIncStLight0000001', 'traffic_signals_and_streetlights', 'streetlight_outage',
  'Traffic signals and streetlights',
  'Streetlight dark over the sidewalk on E Pratt.',
  array['streetlight_outage', 'pedestrian_exposure'],
  array['TRM-Street Light Out', 'BGE-StLight(s) Out', 'BGE-StLight(s) Out Rear'], 'manual_review',
  39.28655, -76.61310, 'E Pratt St near Light St, Baltimore', 'reported', 'normal', 0,
  2, 0, 6, 0.91, 2,
  40, (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint - 2400000,
  (extract(epoch from now()) * 1000)::bigint,
  'pending', null, null, null, null,
  0.81768, 2, 'ready_to_submit'
);

-- 3) One minor litter report, below the 0.6 filing threshold.
insert into public.incidents (
  id, category, incident_type, short_label, full_description, tags,
  baltimore_service_candidates, routing_disposition,
  latitude, longitude, location_address, status, severity, credibility_score,
  evidence_count, confirmation_count, highest_seriousness, average_ai_confidence, ai_evidence_count,
  cluster_radius_m, last_reported_at, created_at, updated_at,
  mock_status, mock_error, mock_reference_id, mock_submitted_at, mock_agency,
  incident_score, report_count, government_report_status
) values (
  'seedIncLitter00000001', 'trash_and_sanitation', 'illegal_dumping', 'Trash and sanitation',
  'Scattered bags on the sidewalk. Needs more independent reports.',
  array['illegal_dumping', 'sidewalk'],
  array['HCD-Illegal Dumping'], '311',
  39.29310, -76.61580, 'N Charles St & E 25th St, Baltimore', 'reported', 'normal', 0,
  1, 0, 2, 0.90, 1,
  25, (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint,
  'pending', null, null, null, null,
  0.19, 1, 'not_ready'
);

-- 4) Structure fire. High score, so the worker files it to the general 311 mock.
insert into public.incidents (
  id, category, incident_type, short_label, full_description, tags,
  baltimore_service_candidates, routing_disposition,
  latitude, longitude, location_address, status, severity, credibility_score,
  evidence_count, confirmation_count, highest_seriousness, average_ai_confidence, ai_evidence_count,
  cluster_radius_m, last_reported_at, created_at, updated_at,
  mock_status, mock_error, mock_reference_id, mock_submitted_at, mock_agency,
  incident_score, report_count, government_report_status
) values (
  'seedIncFire0000000001', 'fire_injury_or_immediate_threat', 'structure_fire',
  'Fire, injury, or immediate threat',
  'Active flames and smoke from a building. Call 911.',
  array['active_flames', 'building', 'smoke', 'structure_fire'],
  array[]::text[], 'emergency',
  39.28720, -76.60940, 'E Baltimore St, Baltimore', 'reported', 'normal', 0,
  1, 0, 10, 0.98, 1,
  40, (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint,
  'pending', null, null, null, null,
  0.99, 1, 'ready_to_submit'
);

-- 5) Illegal dumping already filed to the general 311 mock.
insert into public.incidents (
  id, category, incident_type, short_label, full_description, tags,
  baltimore_service_candidates, routing_disposition,
  latitude, longitude, location_address, status, severity, credibility_score,
  evidence_count, confirmation_count, highest_seriousness, average_ai_confidence, ai_evidence_count,
  cluster_radius_m, last_reported_at, created_at, updated_at,
  mock_status, mock_error, mock_reference_id, mock_submitted_at, mock_agency,
  incident_score, report_count, government_report_status
) values (
  'seedIncDumping0000001', 'trash_and_sanitation', 'illegal_dumping', 'Trash and sanitation',
  'Mattress and bags dumped in the alley. Already filed in the demo.',
  array['illegal_dumping', 'alley'],
  array['HCD-Illegal Dumping'], '311',
  39.29805, -76.61995, 'Alley behind N Howard St, Baltimore', 'reported', 'normal', 0,
  2, 0, 5, 0.895, 2,
  30, (extract(epoch from now()) * 1000)::bigint,
  (extract(epoch from now()) * 1000)::bigint - 7200000,
  (extract(epoch from now()) * 1000)::bigint,
  'submitted', null, 'general:MOCK-SEED-311', (extract(epoch from now()) * 1000)::bigint - 600000, 'general',
  0.723075, 2, 'submitted'
);

insert into public.reports (
  id, incident_id, session_id, image_path, image_hash, category, incident_type, short_label,
  full_description, user_description, context_summary, tags,
  baltimore_service_candidates, routing_disposition,
  latitude, longitude, location_accuracy, location_source, location_address,
  ai_confidence, seriousness, analysis_status, ai_model, user_corrected,
  created_at, withdrawn, idempotency_key, case_score
) values
(
  'seedRptPotholeA000001', 'seedIncPothole0000001', 'seedSessionPotholeA0000000000001',
  'https://seed.local/pothole-a.jpg', 'seed-hash-pothole-a',
  'roads_and_sidewalks', 'pothole', 'Roads and sidewalks',
  'Large pothole in the travel lane near Calvert and Madison.',
  'Deep hole in the right lane.',
  'A large pothole is visible in the asphalt travel lane.',
  array['pothole', 'roadway'],
  array['TRM-Potholes', 'TRM-Pickup Pothole'], '311',
  39.29040, -76.61220, 12, 'gps', 'Calvert St & Madison St, Baltimore',
  0.95, 6, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint - 3600000, 0,
  '11111111-1111-4111-8111-000000000001', 0.585
),
(
  'seedRptPotholeB000001', 'seedIncPothole0000001', 'seedSessionPotholeB0000000000001',
  'https://seed.local/pothole-b.jpg', 'seed-hash-pothole-b',
  'roads_and_sidewalks', 'pothole', 'Roads and sidewalks',
  'Same pothole from the opposite curb.',
  'Same hole, still in the travel lane.',
  'Broken asphalt with a wide pothole beside the lane stripe.',
  array['pothole', 'roadway'],
  array['TRM-Potholes', 'TRM-Pickup Pothole'], '311',
  39.29055, -76.61210, 15, 'gps', 'Calvert St & Madison St, Baltimore',
  0.95, 6, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint - 1800000, 0,
  '11111111-1111-4111-8111-000000000002', 0.585
),
(
  'seedRptStLightA000001', 'seedIncStLight0000001', 'seedSessionStLightA0000000000001',
  'https://seed.local/streetlight-a.jpg', 'seed-hash-streetlight-a',
  'traffic_signals_and_streetlights', 'streetlight_outage', 'Traffic signals and streetlights',
  'Streetlight dark over the sidewalk on E Pratt.',
  'Light is out above the sidewalk.',
  'An unlit streetlight pole is visible above a dark sidewalk.',
  array['streetlight_outage', 'pedestrian_exposure'],
  array['TRM-Street Light Out', 'BGE-StLight(s) Out', 'BGE-StLight(s) Out Rear'], 'manual_review',
  39.28650, -76.61300, 18, 'gps', 'E Pratt St near Light St, Baltimore',
  0.92, 6, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint - 2400000, 0,
  '11111111-1111-4111-8111-000000000003', 0.576
),
(
  'seedRptStLightB000001', 'seedIncStLight0000001', 'seedSessionStLightB0000000000001',
  'https://seed.local/streetlight-b.jpg', 'seed-hash-streetlight-b',
  'traffic_signals_and_streetlights', 'streetlight_outage', 'Traffic signals and streetlights',
  'Same dark pole from a few steps south.',
  'Still out. Hard to see the curb.',
  'A streetlight is dark beside parked cars.',
  array['streetlight_outage', 'pedestrian_exposure'],
  array['TRM-Street Light Out', 'BGE-StLight(s) Out', 'BGE-StLight(s) Out Rear'], 'manual_review',
  39.28660, -76.61320, 20, 'gps', 'E Pratt St near Light St, Baltimore',
  0.90, 6, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint - 600000, 0,
  '11111111-1111-4111-8111-000000000004', 0.57
),
(
  'seedRptLitterA0000001', 'seedIncLitter00000001', 'seedSessionLitterA00000000000001',
  'https://seed.local/litter-a.jpg', 'seed-hash-litter-a',
  'trash_and_sanitation', 'illegal_dumping', 'Trash and sanitation',
  'Scattered bags on the sidewalk.',
  'A couple of bags left on the sidewalk.',
  'Loose trash bags are visible on a sidewalk.',
  array['illegal_dumping', 'sidewalk'],
  array['HCD-Illegal Dumping'], '311',
  39.29310, -76.61580, 10, 'gps', 'N Charles St & E 25th St, Baltimore',
  0.90, 2, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint, 0,
  '11111111-1111-4111-8111-000000000005', 0.19
),
(
  'seedRptFireA000000001', 'seedIncFire0000000001', 'seedSessionFireA0000000000000001',
  'https://seed.local/fire-a.jpg', 'seed-hash-fire-a',
  'fire_injury_or_immediate_threat', 'structure_fire', 'Fire, injury, or immediate threat',
  'Active flames and smoke from a building. Call 911.',
  'Building on fire.',
  'Flames and smoke are visible rising from a building.',
  array['active_flames', 'building', 'smoke', 'structure_fire'],
  array[]::text[], 'emergency',
  39.28720, -76.60940, 20, 'gps', 'E Baltimore St, Baltimore',
  0.98, 10, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint, 0,
  '11111111-1111-4111-8111-000000000006', 0.99
),
(
  'seedRptDumpingA000001', 'seedIncDumping0000001', 'seedSessionDumpingA0000000000001',
  'https://seed.local/dumping-a.jpg', 'seed-hash-dumping-a',
  'trash_and_sanitation', 'illegal_dumping', 'Trash and sanitation',
  'Mattress and bags dumped in the alley.',
  'Mattress dumped behind the row houses.',
  'A mattress and trash bags are piled in an alley.',
  array['illegal_dumping', 'alley'],
  array['HCD-Illegal Dumping'], '311',
  39.29800, -76.62000, 14, 'gps', 'Alley behind N Howard St, Baltimore',
  0.88, 5, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint - 7200000, 0,
  '11111111-1111-4111-8111-000000000007', 0.47
),
(
  'seedRptDumpingB000001', 'seedIncDumping0000001', 'seedSessionDumpingB0000000000001',
  'https://seed.local/dumping-b.jpg', 'seed-hash-dumping-b',
  'trash_and_sanitation', 'illegal_dumping', 'Trash and sanitation',
  'Same alley pile from the other end.',
  'Still sitting there.',
  'Bulk trash including a mattress is visible in the alley.',
  array['illegal_dumping', 'alley'],
  array['HCD-Illegal Dumping'], '311',
  39.29810, -76.61990, 16, 'gps', 'Alley behind N Howard St, Baltimore',
  0.91, 5, 'complete', 'gemini-seed', 0,
  (extract(epoch from now()) * 1000)::bigint - 5400000, 0,
  '11111111-1111-4111-8111-000000000008', 0.4775
);

insert into public.image_analyses (
  id, session_id, image_path, image_hash, category, incident_type, context_summary,
  context_tags, tags, seriousness, ai_confidence, case_score, model, prompt_version,
  analysis_status, report_id, incident_id, latitude, longitude, location_address,
  baltimore_service_candidates, routing_disposition, submitted_at
) values
(
  '11111111-1111-4111-8111-000000000001', 'seedSessionPotholeA0000000000001',
  'https://seed.local/pothole-a.jpg', 'seed-hash-pothole-a',
  'roads_and_sidewalks', 'pothole', 'A large pothole is visible in the asphalt travel lane.',
  array['roadway'], array['pothole', 'roadway'], 6, 95, 0.585, 'gemini-seed', 'seed',
  'complete', 'seedRptPotholeA000001', 'seedIncPothole0000001', 39.29040, -76.61220,
  'Calvert St & Madison St, Baltimore',
  array['TRM-Potholes', 'TRM-Pickup Pothole'], '311', now() - interval '1 hour'
),
(
  '11111111-1111-4111-8111-000000000002', 'seedSessionPotholeB0000000000001',
  'https://seed.local/pothole-b.jpg', 'seed-hash-pothole-b',
  'roads_and_sidewalks', 'pothole', 'Broken asphalt with a wide pothole beside the lane stripe.',
  array['roadway'], array['pothole', 'roadway'], 6, 95, 0.585, 'gemini-seed', 'seed',
  'complete', 'seedRptPotholeB000001', 'seedIncPothole0000001', 39.29055, -76.61210,
  'Calvert St & Madison St, Baltimore',
  array['TRM-Potholes', 'TRM-Pickup Pothole'], '311', now() - interval '30 minutes'
),
(
  '11111111-1111-4111-8111-000000000003', 'seedSessionStLightA0000000000001',
  'https://seed.local/streetlight-a.jpg', 'seed-hash-streetlight-a',
  'traffic_signals_and_streetlights', 'streetlight_outage',
  'An unlit streetlight pole is visible above a dark sidewalk.',
  array['pedestrian_exposure'], array['pedestrian_exposure', 'streetlight_outage'], 6, 92, 0.576, 'gemini-seed', 'seed',
  'complete', 'seedRptStLightA000001', 'seedIncStLight0000001', 39.28650, -76.61300,
  'E Pratt St near Light St, Baltimore',
  array['TRM-Street Light Out', 'BGE-StLight(s) Out', 'BGE-StLight(s) Out Rear'], 'manual_review',
  now() - interval '40 minutes'
),
(
  '11111111-1111-4111-8111-000000000004', 'seedSessionStLightB0000000000001',
  'https://seed.local/streetlight-b.jpg', 'seed-hash-streetlight-b',
  'traffic_signals_and_streetlights', 'streetlight_outage',
  'A streetlight is dark beside parked cars.',
  array['pedestrian_exposure'], array['pedestrian_exposure', 'streetlight_outage'], 6, 90, 0.57, 'gemini-seed', 'seed',
  'complete', 'seedRptStLightB000001', 'seedIncStLight0000001', 39.28660, -76.61320,
  'E Pratt St near Light St, Baltimore',
  array['TRM-Street Light Out', 'BGE-StLight(s) Out', 'BGE-StLight(s) Out Rear'], 'manual_review',
  now() - interval '10 minutes'
),
(
  '11111111-1111-4111-8111-000000000005', 'seedSessionLitterA00000000000001',
  'https://seed.local/litter-a.jpg', 'seed-hash-litter-a',
  'trash_and_sanitation', 'illegal_dumping', 'Loose trash bags are visible on a sidewalk.',
  array['sidewalk'], array['illegal_dumping', 'sidewalk'], 2, 90, 0.19, 'gemini-seed', 'seed',
  'complete', 'seedRptLitterA0000001', 'seedIncLitter00000001', 39.29310, -76.61580,
  'N Charles St & E 25th St, Baltimore',
  array['HCD-Illegal Dumping'], '311', now()
),
(
  '11111111-1111-4111-8111-000000000006', 'seedSessionFireA0000000000000001',
  'https://seed.local/fire-a.jpg', 'seed-hash-fire-a',
  'fire_injury_or_immediate_threat', 'structure_fire',
  'Flames and smoke are visible rising from a building.',
  array['active_flames', 'building', 'smoke'], array['active_flames', 'building', 'smoke', 'structure_fire'],
  10, 98, 0.99, 'gemini-seed', 'seed',
  'complete', 'seedRptFireA000000001', 'seedIncFire0000000001', 39.28720, -76.60940,
  'E Baltimore St, Baltimore',
  array[]::text[], 'emergency', now()
),
(
  '11111111-1111-4111-8111-000000000007', 'seedSessionDumpingA0000000000001',
  'https://seed.local/dumping-a.jpg', 'seed-hash-dumping-a',
  'trash_and_sanitation', 'illegal_dumping', 'A mattress and trash bags are piled in an alley.',
  array['alley'], array['illegal_dumping', 'alley'], 5, 88, 0.47, 'gemini-seed', 'seed',
  'complete', 'seedRptDumpingA000001', 'seedIncDumping0000001', 39.29800, -76.62000,
  'Alley behind N Howard St, Baltimore',
  array['HCD-Illegal Dumping'], '311', now() - interval '2 hours'
),
(
  '11111111-1111-4111-8111-000000000008', 'seedSessionDumpingB0000000000001',
  'https://seed.local/dumping-b.jpg', 'seed-hash-dumping-b',
  'trash_and_sanitation', 'illegal_dumping', 'Bulk trash including a mattress is visible in the alley.',
  array['alley'], array['illegal_dumping', 'alley'], 5, 91, 0.4775, 'gemini-seed', 'seed',
  'complete', 'seedRptDumpingB000001', 'seedIncDumping0000001', 39.29810, -76.61990,
  'Alley behind N Howard St, Baltimore',
  array['HCD-Illegal Dumping'], '311', now() - interval '90 minutes'
);

insert into public.incident_confirmations (incident_id, session_id, created_at)
values (
  'seedIncPothole0000001',
  'seedSessionLitterA00000000000001',
  (extract(epoch from now()) * 1000)::bigint
);

commit;
