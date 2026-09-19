#!/usr/bin/env node

/**
 * Database initialization script
 * Run this to set up the SQLite database and verify setup
 */

import { DatabaseService } from './lib/db.js';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data');
const uploadsDir = path.join(process.cwd(), 'public', 'uploads');

// Ensure directories exist
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  console.log('✓ Created data directory');
}

if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
  console.log('✓ Created uploads directory');
}

// Test database connection
try {
  const sessionId = DatabaseService.createSession();
  console.log('✓ Database initialized successfully');
  console.log(`✓ Test session created: ${sessionId}`);
  
  console.log('\n✅ Setup complete! You can now run: npm run dev');
} catch (error) {
  console.error('❌ Database initialization failed:', error);
  process.exit(1);
}
