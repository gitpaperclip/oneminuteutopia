import Database from 'better-sqlite3';
import path from 'path';
import { nanoid } from 'nanoid';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'app.db');
const db = new Database(dbPath);

// Initialize database schema
db.exec(`
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
    latitude REAL,
    longitude REAL,
    location_accuracy REAL,
    location_source TEXT,
    location_address TEXT,
    ai_confidence REAL,
    ai_model TEXT,
    ai_routing TEXT,
    user_corrected INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    withdrawn INTEGER DEFAULT 0,
    idempotency_key TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    short_label TEXT NOT NULL,
    full_description TEXT,
    latitude REAL,
    longitude REAL,
    location_address TEXT,
    status TEXT DEFAULT 'reported',
    severity TEXT DEFAULT 'normal',
    credibility_score INTEGER DEFAULT 0,
    evidence_count INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS status_events (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT NOT NULL,
    actor_session TEXT,
    actor_type TEXT,
    reason TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (incident_id) REFERENCES incidents(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    is_organizer INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_reports_incident ON reports(incident_id);
  CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
  CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents(latitude, longitude);
`);

export interface Report {
  id: string;
  incident_id: string | null;
  session_id: string;
  image_path: string;
  image_hash: string;
  category: string;
  short_label: string;
  full_description: string | null;
  user_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  location_source: string | null;
  location_address: string | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_routing: string | null;
  user_corrected: number;
  created_at: number;
  withdrawn: number;
  idempotency_key: string | null;
}

export interface Incident {
  id: string;
  category: string;
  short_label: string;
  full_description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_address: string | null;
  status: string;
  severity: string;
  credibility_score: number;
  evidence_count: number;
  created_at: number;
  updated_at: number;
}

export class DatabaseService {
  static createSession(): string {
    const sessionId = nanoid();
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO sessions (id, is_organizer, created_at, last_seen)
      VALUES (?, 0, ?, ?)
    `).run(sessionId, now, now);
    
    return sessionId;
  }

  static updateSessionActivity(sessionId: string): void {
    db.prepare(`
      UPDATE sessions SET last_seen = ? WHERE id = ?
    `).run(Date.now(), sessionId);
  }

  static isOrganizer(sessionId: string): boolean {
    const result = db.prepare(`
      SELECT is_organizer FROM sessions WHERE id = ?
    `).get(sessionId) as { is_organizer: number } | undefined;
    
    return result?.is_organizer === 1;
  }

  static createOrganizerSession(): string {
    const sessionId = nanoid();
    const now = Date.now();
    
    db.prepare(`
      INSERT INTO sessions (id, is_organizer, created_at, last_seen)
      VALUES (?, 1, ?, ?)
    `).run(sessionId, now, now);
    
    return sessionId;
  }

  static createIncident(data: {
    category: string;
    short_label: string;
    full_description: string | null;
    latitude: number | null;
    longitude: number | null;
    location_address: string | null;
  }): string {
    const incidentId = nanoid();
    const now = Date.now();

    db.prepare(`
      INSERT INTO incidents (
        id, category, short_label, full_description,
        latitude, longitude, location_address,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'reported', ?, ?)
    `).run(
      incidentId,
      data.category,
      data.short_label,
      data.full_description,
      data.latitude,
      data.longitude,
      data.location_address,
      now,
      now
    );

    return incidentId;
  }

  static createReport(data: {
    session_id: string;
    incident_id: string;
    image_path: string;
    image_hash: string;
    category: string;
    short_label: string;
    full_description: string | null;
    user_description: string | null;
    latitude: number | null;
    longitude: number | null;
    location_accuracy: number | null;
    location_source: string | null;
    location_address: string | null;
    ai_confidence: number | null;
    ai_model: string | null;
    ai_routing: string | null;
    user_corrected: number;
    idempotency_key: string;
  }): string {
    const reportId = nanoid();
    const now = Date.now();

    db.prepare(`
      INSERT INTO reports (
        id, incident_id, session_id, image_path, image_hash,
        category, short_label, full_description, user_description,
        latitude, longitude, location_accuracy, location_source,
        location_address, ai_confidence, ai_model, ai_routing,
        user_corrected, created_at, idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      data.incident_id,
      data.session_id,
      data.image_path,
      data.image_hash,
      data.category,
      data.short_label,
      data.full_description,
      data.user_description,
      data.latitude,
      data.longitude,
      data.location_accuracy,
      data.location_source,
      data.location_address,
      data.ai_confidence,
      data.ai_model,
      data.ai_routing,
      data.user_corrected,
      now,
      data.idempotency_key
    );

    return reportId;
  }

  static getReportByIdempotencyKey(key: string): Report | undefined {
    return db.prepare(`
      SELECT * FROM reports WHERE idempotency_key = ?
    `).get(key) as Report | undefined;
  }

  static getReport(id: string): Report | undefined {
    return db.prepare(`
      SELECT * FROM reports WHERE id = ?
    `).get(id) as Report | undefined;
  }

  static getIncident(id: string): Incident | undefined {
    return db.prepare(`
      SELECT * FROM incidents WHERE id = ?
    `).get(id) as Incident | undefined;
  }

  static getAllIncidents(): Incident[] {
    return db.prepare(`
      SELECT * FROM incidents ORDER BY created_at DESC
    `).all() as Incident[];
  }

  static getReportsForIncident(incidentId: string): Report[] {
    return db.prepare(`
      SELECT * FROM reports WHERE incident_id = ? AND withdrawn = 0
      ORDER BY created_at ASC
    `).all(incidentId) as Report[];
  }

  static updateIncidentStatus(
    incidentId: string,
    newStatus: string,
    actorSession: string,
    actorType: string
  ): void {
    const incident = this.getIncident(incidentId);
    if (!incident) throw new Error('Incident not found');

    const eventId = nanoid();
    const now = Date.now();

    db.transaction(() => {
      db.prepare(`
        UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?
      `).run(newStatus, now, incidentId);

      db.prepare(`
        INSERT INTO status_events (
          id, incident_id, old_status, new_status,
          actor_session, actor_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, incidentId, incident.status, newStatus, actorSession, actorType, now);
    })();
  }
}

export default db;
