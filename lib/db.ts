import postgres from 'postgres';
import { nanoid } from 'nanoid';

// Configuration note: For Supabase on Vercel serverless, use the Transaction pooler URI
// (port 6543, host ending in pooler.supabase.com) in DATABASE_URL.
// Example: postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require
// The prepare:false option is required for PgBouncer compatibility in transaction pooling mode.

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
  private static sql: ReturnType<typeof postgres> | null = null;

  static getConnection(): ReturnType<typeof postgres> {
    if (this.sql) return this.sql;

    // Prefer Supabase DATABASE_URL over legacy Vercel POSTGRES_URL
    const connectionString = 
      process.env.DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING;

    if (!connectionString) {
      throw new Error('No database connection string found. Set DATABASE_URL or SUPABASE_DB_URL.');
    }

    this.sql = postgres(connectionString, {
      ssl: connectionString.includes('supabase.co') ? 'require' : undefined,
      prepare: false, // Required for PgBouncer transaction pooling mode
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

    return this.sql;
  }

  /**
   * Test database connectivity with a simple SELECT query.
   * Throws an error if the connection fails.
   */
  static async testConnection(): Promise<void> {
    try {
      const sql = this.getConnection();
      await sql`SELECT 1 as test`;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Database connection test failed: ${message}`);
    }
  }

  static async ensureTablesExist(): Promise<void> {
    try {
      // Test connection first
      await this.testConnection();

      const sql = this.getConnection();
      
      await sql`
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
        )
      `;

      await sql`
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
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS status_events (
          id TEXT PRIMARY KEY,
          incident_id TEXT NOT NULL,
          old_status TEXT,
          new_status TEXT NOT NULL,
          actor_session TEXT,
          actor_type TEXT,
          reason TEXT,
          created_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          is_organizer INTEGER DEFAULT 0,
          created_at BIGINT NOT NULL,
          last_seen BIGINT NOT NULL
        )
      `;

      // Create indexes if they don't exist
      await sql`CREATE INDEX IF NOT EXISTS idx_reports_incident ON reports(incident_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_reports_session ON reports(session_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_incidents_location ON incidents(latitude, longitude)`;
    } catch (error) {
      console.error('Error ensuring tables exist:', error);
      const message = error instanceof Error ? error.message : 'Unknown database error';
      throw new Error(`Failed to initialize database: ${message}`);
    }
  }

  static async createSession(): Promise<string> {
    await this.ensureTablesExist();
    const sql = this.getConnection();
    const sessionId = nanoid();
    const now = Date.now();
    
    await sql`
      INSERT INTO sessions (id, is_organizer, created_at, last_seen)
      VALUES (${sessionId}, 0, ${now}, ${now})
    `;
    
    return sessionId;
  }

  static async updateSessionActivity(sessionId: string): Promise<void> {
    const sql = this.getConnection();
    await sql`
      UPDATE sessions SET last_seen = ${Date.now()} WHERE id = ${sessionId}
    `;
  }

  static async isOrganizer(sessionId: string): Promise<boolean> {
    const sql = this.getConnection();
    const result = await sql<{ is_organizer: number }[]>`
      SELECT is_organizer FROM sessions WHERE id = ${sessionId}
    `;
    
    return result[0]?.is_organizer === 1;
  }

  static async createOrganizerSession(): Promise<string> {
    await this.ensureTablesExist();
    const sql = this.getConnection();
    const sessionId = nanoid();
    const now = Date.now();
    
    await sql`
      INSERT INTO sessions (id, is_organizer, created_at, last_seen)
      VALUES (${sessionId}, 1, ${now}, ${now})
    `;
    
    return sessionId;
  }

  static async createIncident(data: {
    category: string;
    short_label: string;
    full_description: string | null;
    latitude: number | null;
    longitude: number | null;
    location_address: string | null;
  }): Promise<string> {
    await this.ensureTablesExist();
    const sql = this.getConnection();
    const incidentId = nanoid();
    const now = Date.now();

    await sql`
      INSERT INTO incidents (
        id, category, short_label, full_description,
        latitude, longitude, location_address,
        status, created_at, updated_at
      ) VALUES (
        ${incidentId},
        ${data.category},
        ${data.short_label},
        ${data.full_description},
        ${data.latitude},
        ${data.longitude},
        ${data.location_address},
        'reported',
        ${now},
        ${now}
      )
    `;

    return incidentId;
  }

  static async createReport(data: {
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
  }): Promise<string> {
    await this.ensureTablesExist();
    const sql = this.getConnection();
    const reportId = nanoid();
    const now = Date.now();

    await sql`
      INSERT INTO reports (
        id, incident_id, session_id, image_path, image_hash,
        category, short_label, full_description, user_description,
        latitude, longitude, location_accuracy, location_source,
        location_address, ai_confidence, ai_model, ai_routing,
        user_corrected, created_at, idempotency_key
      ) VALUES (
        ${reportId},
        ${data.incident_id},
        ${data.session_id},
        ${data.image_path},
        ${data.image_hash},
        ${data.category},
        ${data.short_label},
        ${data.full_description},
        ${data.user_description},
        ${data.latitude},
        ${data.longitude},
        ${data.location_accuracy},
        ${data.location_source},
        ${data.location_address},
        ${data.ai_confidence},
        ${data.ai_model},
        ${data.ai_routing},
        ${data.user_corrected},
        ${now},
        ${data.idempotency_key}
      )
    `;

    return reportId;
  }

  static async getReportByIdempotencyKey(key: string): Promise<Report | undefined> {
    const sql = this.getConnection();
    const result = await sql<Report[]>`
      SELECT * FROM reports WHERE idempotency_key = ${key}
    `;
    return result[0];
  }

  static async getReport(id: string): Promise<Report | undefined> {
    const sql = this.getConnection();
    const result = await sql<Report[]>`
      SELECT * FROM reports WHERE id = ${id}
    `;
    return result[0];
  }

  static async getIncident(id: string): Promise<Incident | undefined> {
    const sql = this.getConnection();
    const result = await sql<Incident[]>`
      SELECT * FROM incidents WHERE id = ${id}
    `;
    return result[0];
  }

  static async getAllIncidents(): Promise<Incident[]> {
    const sql = this.getConnection();
    const result = await sql<Incident[]>`
      SELECT * FROM incidents ORDER BY created_at DESC
    `;
    return result;
  }

  static async getReportsForIncident(incidentId: string): Promise<Report[]> {
    const sql = this.getConnection();
    const result = await sql<Report[]>`
      SELECT * FROM reports WHERE incident_id = ${incidentId} AND withdrawn = 0
      ORDER BY created_at ASC
    `;
    return result;
  }

  static async updateIncidentStatus(
    incidentId: string,
    newStatus: string,
    actorSession: string,
    actorType: string
  ): Promise<void> {
    const sql = this.getConnection();
    const incident = await this.getIncident(incidentId);
    if (!incident) throw new Error('Incident not found');

    const eventId = nanoid();
    const now = Date.now();

    await sql.begin(async (txSql) => {
      await txSql`
        UPDATE incidents SET status = ${newStatus}, updated_at = ${now} WHERE id = ${incidentId}
      `;

      await txSql`
        INSERT INTO status_events (
          id, incident_id, old_status, new_status,
          actor_session, actor_type, created_at
        ) VALUES (
          ${eventId},
          ${incidentId},
          ${incident.status},
          ${newStatus},
          ${actorSession},
          ${actorType},
          ${now}
        )
      `;
    });
  }
}
