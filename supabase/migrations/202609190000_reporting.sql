-- Run once in Supabase before deploying. Additive; keeps existing reports.
begin;
CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          incident_id TEXT,
          session_id TEXT NOT NULL,
          image_path TEXT NOT NULL,
          image_hash TEXT NOT NULL,
          category TEXT NOT NULL,
          short_label TEXT NOT NULL,
          full_description TEXT,
          user_description TEXT,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          location_accuracy DOUBLE PRECISION,
          location_source TEXT,
          location_address TEXT,
          ai_confidence DOUBLE PRECISION,
          ai_model TEXT,
          ai_routing TEXT,
          user_corrected INTEGER DEFAULT 0,
          created_at BIGINT NOT NULL,
          withdrawn INTEGER DEFAULT 0,
          idempotency_key TEXT UNIQUE
        );

CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          short_label TEXT NOT NULL,
          full_description TEXT,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          location_address TEXT,
          status TEXT DEFAULT 'reported',
          severity TEXT DEFAULT 'normal',
          credibility_score INTEGER DEFAULT 0,
          evidence_count INTEGER DEFAULT 1,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        );



CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          
          created_at BIGINT NOT NULL,
          last_seen BIGINT NOT NULL
        );

ALTER TABLE reports ADD COLUMN IF NOT EXISTS incident_id TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS session_id TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_path TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS image_hash TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS short_label TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS full_description TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_description TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS location_accuracy DOUBLE PRECISION;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS location_source TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS location_address TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_confidence DOUBLE PRECISION;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_model TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_routing TEXT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS user_corrected INTEGER DEFAULT 0;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS created_at BIGINT;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS withdrawn INTEGER DEFAULT 0;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS short_label TEXT;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS full_description TEXT;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS location_address TEXT;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'reported';

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'normal';

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS credibility_score INTEGER DEFAULT 0;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS evidence_count INTEGER DEFAULT 1;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS created_at BIGINT;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS updated_at BIGINT;

















ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at BIGINT;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen BIGINT;

CREATE INDEX IF NOT EXISTS idx_reports_incident ON reports(incident_id);

CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents(latitude, longitude);

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS seriousness smallint;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS analysis_status text;
CREATE UNIQUE INDEX IF NOT EXISTS reports_idempotency_key_unique ON public.reports(idempotency_key);
CREATE TABLE IF NOT EXISTS public.request_limits (
  key text primary key,
  count integer not null check (count >= 1),
  reset_at bigint not null
);
-- Anonymous cookies are authenticated on the app server, never through public SQL/REST policies.
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reports, public.incidents, public.sessions, public.request_limits FROM anon, authenticated;
GRANT ALL ON public.reports, public.incidents, public.sessions, public.request_limits TO service_role;
commit;

-- Retired coordinator records may exist on upgrades; retain data but close browser access.
DO $$ BEGIN
  IF to_regclass('public.status_events') IS NOT NULL THEN
    ALTER TABLE public.status_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.status_events FROM anon, authenticated;
  END IF;
END $$;
