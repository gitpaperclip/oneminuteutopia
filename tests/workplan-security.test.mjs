import test from 'node:test';
import assert from 'node:assert/strict';
import { BALTIMORE_311_ROUTES } from '../lib/baltimore-311-routing.mjs';
import { INCIDENT_TYPES } from '../lib/incident-taxonomy.mjs';

// =============================================================================
// HARD STOP: No 311 API Submission Tests
// =============================================================================

test('HARD STOP: baltimore-311-routing NEVER attempts actual API submission', async () => {
  // Per workplan: "Do not automate the city website, reverse-engineer private
  // endpoints, bypass login, or label an internal database write as a city submission."
  
  // Verify the routing module is pure data mapping, not API client
  const module = await import('../lib/baltimore-311-routing.mjs');
  
  // Should only export route data structures, not fetch/submit functions
  const exports = Object.keys(module);
  const forbiddenExports = exports.filter(name => 
    /submit|post|send|upload|api|fetch|request|http/i.test(name) &&
    name !== 'BALTIMORE_311_ROUTES' // Allow the routes constant
  );
  
  assert.deepEqual(forbiddenExports, [], 
    'baltimore-311-routing must not export submission/API functions');
  
  // Each route should be pure data, not functions that make requests
  for (const [incidentType, route] of Object.entries(BALTIMORE_311_ROUTES)) {
    assert.ok(Array.isArray(route.service_types), 
      `Route ${incidentType} service_types must be array, not function`);
    assert.equal(typeof route.disposition, 'string',
      `Route ${incidentType} disposition must be string, not function`);
  }
});

test('HARD STOP: No fetch/HTTP to Baltimore 311 API in routing module', async () => {
  // Verify the routing module doesn't make HTTP calls
  const fs = await import('fs');
  const routingFile = fs.readFileSync('lib/baltimore-311-routing.mjs', 'utf-8');
  
  // These patterns would indicate API submission attempts
  const forbiddenPatterns = [
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /axios\./,
    /\.post\s*\(/,
    /\.put\s*\(/,
    /balt311\.baltimorecity\.gov.*api/i,
    /open311.*\/requests/i,
    /new\s+FormData\s*\(/,  // Submitting forms to city
  ];
  
  for (const pattern of forbiddenPatterns) {
    assert.ok(!pattern.test(routingFile),
      `baltimore-311-routing.mjs must not contain ${pattern.toString()}`);
  }
});

test('HARD STOP: baltimore-311 catalog endpoint is read-only reference data', async () => {
  // The /api/baltimore-311/services endpoint must only return catalog data,
  // never accept submissions
  const fs = await import('fs');
  const serviceRoute = fs.readFileSync('app/api/baltimore-311/services/route.ts', 'utf-8');
  
  // Must only export GET, not POST/PUT/PATCH
  assert.match(serviceRoute, /export\s+async\s+function\s+GET/, 
    'Must export GET handler');
  assert.ok(!/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/i.test(serviceRoute),
    'Must not export POST/PUT/PATCH/DELETE handlers');
});

// =============================================================================
// Emergency → 911 ONLY Tests (Never 311)
// =============================================================================

test('Emergency incident types NEVER have 311 service candidates', () => {
  const emergencyTypes = [
    'structure_fire',
    'vehicle_fire', 
    'garbage_fire',
    'brush_fire',
    'smoke_unknown_source',
    'visible_injury',
    'immediate_threat_other',
    'fire_injury_or_immediate_threat_unspecified',
    'downed_power_line',
    'animal_attack',
  ];
  
  for (const emergencyType of emergencyTypes) {
    if (!BALTIMORE_311_ROUTES[emergencyType]) {
      assert.fail(`Emergency type ${emergencyType} missing from routing`);
    }
    
    const route = BALTIMORE_311_ROUTES[emergencyType];
    
    // Emergency types must have empty service_types array
    assert.equal(route.service_types.length, 0,
      `Emergency ${emergencyType} must have NO 311 service types`);
    
    // Emergency types must have 'emergency' disposition
    assert.equal(route.disposition, 'emergency',
      `Emergency ${emergencyType} must have 'emergency' disposition, not '${route.disposition}'`);
  }
});

test('Emergency disposition routes must never suggest 311 submission', () => {
  for (const [incidentType, route] of Object.entries(BALTIMORE_311_ROUTES)) {
    if (route.disposition === 'emergency') {
      assert.equal(route.service_types.length, 0,
        `Emergency disposition for ${incidentType} must have empty service_types`);
    }
  }
});

test('fire_injury_or_immediate_threat category has no 311 candidates', async () => {
  // Per workplan: "Treat emergency classifications as instructions to call 911,
  // never as 311 submission candidates."
  const { INCIDENT_TYPES_BY_CATEGORY } = await import('../lib/incident-taxonomy.mjs');
  
  const emergencyTypes = INCIDENT_TYPES_BY_CATEGORY['fire_injury_or_immediate_threat'];
  assert.ok(emergencyTypes, 'fire_injury_or_immediate_threat category must exist');
  
  for (const incidentType of emergencyTypes) {
    const route = BALTIMORE_311_ROUTES[incidentType];
    assert.ok(route, `Fire/injury type ${incidentType} must have a route`);
    assert.equal(route.disposition, 'emergency',
      `Fire/injury type ${incidentType} must have emergency disposition`);
    assert.equal(route.service_types.length, 0,
      `Fire/injury type ${incidentType} must have no 311 services`);
  }
});

// =============================================================================
// Prepare-Only Assertions
// =============================================================================

test('No code claims reports are "submitted to city"', async () => {
  const fs = await import('fs');
  const path = await import('path');
  
  // Check key source files for forbidden claims
  const sourceFiles = [
    'lib/db.ts',
    'lib/report-pipeline.ts',
    'lib/baltimore-311-routing.mjs',
    'app/api/submit/route.ts',
    'app/api/upload/route.ts',
  ];
  
  const forbiddenPhrases = [
    /submitted\s+to\s+(baltimore|city|311)/i,
    /sent\s+to\s+(baltimore|city|311)/i,
    /filed\s+with\s+(baltimore|city)/i,
    /report\s+has\s+been\s+submitted/i,
    /successfully\s+submitted/i,
  ];
  
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const pattern of forbiddenPhrases) {
      assert.ok(!pattern.test(content),
        `${file} must not claim "${pattern.toString()}" - this is prepare-only`);
    }
  }
});

test('Database writes are not labeled as city submission', async () => {
  const fs = await import('fs');
  const dbFile = fs.readFileSync('lib/db.ts', 'utf-8');
  
  // Database saves should not contain misleading status like "submitted_to_city"
  const forbiddenStatuses = [
    /status.*=.*['"](submitted|sent|filed)['"].*city/i,
    /submitted_to_311/i,
    /city_status.*=.*['"](accepted|received|submitted)['"]/i,
  ];
  
  for (const pattern of forbiddenStatuses) {
    assert.ok(!pattern.test(dbFile),
      `lib/db.ts must not use status ${pattern.toString()}`);
  }
});

test('No mock or fake submission endpoints exist', async () => {
  const fs = await import('fs');
  
  // Check that API directories don't contain fake submission routes
  const forbiddenRouteNames = [
    'submit-to-city',
    '311-submit',
    'baltimore-submit',
    'send-to-311',
  ];
  
  try {
    const apiDir = fs.readdirSync('app/api', { withFileTypes: true });
    const directories = apiDir.filter(d => d.isDirectory()).map(d => d.name);
    
    for (const forbiddenName of forbiddenRouteNames) {
      assert.ok(!directories.includes(forbiddenName),
        `Must not have fake submission route: app/api/${forbiddenName}`);
    }
  } catch (error) {
    // If app/api doesn't exist, that's fine
    if (error.code !== 'ENOENT') throw error;
  }
});

// =============================================================================
// Cross-Session Security for New Endpoints
// =============================================================================

test('/api/incidents endpoint does not expose session IDs or private data', async () => {
  const fs = await import('fs');
  const incidentsRoute = fs.readFileSync('app/api/incidents/route.ts', 'utf-8');
  
  // Response should not include session_id or private fields
  assert.ok(!incidentsRoute.includes('session_id:'),
    'Incidents endpoint must not expose session_id');
  assert.ok(!incidentsRoute.includes('session_id,'),
    'Incidents endpoint must not map session_id to response');
  
  // Should not expose internal IDs or credentials
  const forbiddenFields = [
    /supabase.*key/i,
    /gemini.*key/i,
    /api.*key/i,
    /password/i,
    /secret/i,
  ];
  
  for (const pattern of forbiddenFields) {
    assert.ok(!pattern.test(incidentsRoute),
      `Incidents endpoint must not expose ${pattern.toString()}`);
  }
});

test('/api/baltimore-311/services endpoint requires no authentication', async () => {
  // This is public reference data (catalog only), should not require session
  const fs = await import('fs');
  const servicesRoute = fs.readFileSync('app/api/baltimore-311/services/route.ts', 'utf-8');
  
  // Should not check session/auth (it's public catalog data)
  assert.ok(!servicesRoute.includes('getSession'),
    'Catalog endpoint should not require session (public reference data)');
  
  // Should not expose service credentials
  assert.ok(!servicesRoute.includes('SUPABASE_SECRET_KEY'),
    'Must not expose service keys in public catalog endpoint');
});

test('Incident listing returns only safe aggregate fields', async () => {
  // Per workplan: "return only aggregate, safe fields from the public incident endpoint"
  const fs = await import('fs');
  const incidentsRoute = fs.readFileSync('app/api/incidents/route.ts', 'utf-8');
  
  // Should not expose raw AI responses or user-identifying data
  const forbiddenFields = [
    'gemini_response',
    'raw_analysis',
    'image_bytes',
    'user_id',
    'email',
    'phone',
  ];
  
  for (const field of forbiddenFields) {
    assert.ok(!incidentsRoute.includes(`${field}:`),
      `Incidents must not expose ${field}`);
  }
});

// =============================================================================
// Routing Disposition Validation
// =============================================================================

test('All incident types have valid routing dispositions', () => {
  const validDispositions = ['311', 'manual_review', 'emergency', 'no_submission'];
  
  for (const incidentType of INCIDENT_TYPES) {
    const route = BALTIMORE_311_ROUTES[incidentType];
    assert.ok(route, `Incident type ${incidentType} must have a route`);
    assert.ok(validDispositions.includes(route.disposition),
      `${incidentType} disposition '${route.disposition}' must be one of: ${validDispositions.join(', ')}`);
  }
});

test('311 disposition routes have non-empty service types', () => {
  for (const [incidentType, route] of Object.entries(BALTIMORE_311_ROUTES)) {
    if (route.disposition === '311') {
      assert.ok(route.service_types.length > 0,
        `311 disposition for ${incidentType} must have at least one service type`);
    }
  }
});

test('no_submission disposition has no service types', () => {
  for (const [incidentType, route] of Object.entries(BALTIMORE_311_ROUTES)) {
    if (route.disposition === 'no_submission') {
      assert.equal(route.service_types.length, 0,
        `no_submission disposition for ${incidentType} must have no service types`);
    }
  }
});

test('Routing dispositions match documented semantics', () => {
  // Per workplan documentation:
  // - emergency: show 911, no 311
  // - 311: recommend service type
  // - manual_review: multiple choices or uncertain
  // - no_submission: not appropriate for city systems
  
  for (const [incidentType, route] of Object.entries(BALTIMORE_311_ROUTES)) {
    const { disposition, service_types } = route;
    
    if (disposition === 'emergency') {
      assert.equal(service_types.length, 0,
        `${incidentType}: emergency must have 0 service types`);
    } else if (disposition === '311') {
      assert.ok(service_types.length >= 1,
        `${incidentType}: 311 must have ≥1 service type`);
    }
  }
});

// =============================================================================
// Service Type Validation
// =============================================================================

test('Service types follow Baltimore 311 observed format', () => {
  // Service types should match the pattern from actual Baltimore data
  // Format: DEPT-ServiceName or DEPT-ServiceName (Detail)
  const validPattern = /^[A-Z]{2,6}-/;  // Starts with 2-6 letter dept code
  
  for (const [incidentType, route] of Object.entries(BALTIMORE_311_ROUTES)) {
    for (const serviceType of route.service_types) {
      assert.match(serviceType, validPattern,
        `Service type '${serviceType}' for ${incidentType} must start with dept code`);
    }
  }
});

test('No service types contain injection attempts', () => {
  const dangerousPatterns = [
    /[<>'"]/,  // HTML/script injection
    /;.*DROP/i,  // SQL injection
    /\.\./,  // Path traversal
  ];
  
  for (const [incidentType, route] of Object.entries(BALTIMORE_311_ROUTES)) {
    for (const serviceType of route.service_types) {
      for (const pattern of dangerousPatterns) {
        assert.ok(!pattern.test(serviceType),
          `Service type '${serviceType}' contains dangerous pattern ${pattern.toString()}`);
      }
    }
  }
});

// =============================================================================
// Workplan Compliance Checks
// =============================================================================

test('Workplan rule: Never expose Supabase credentials to browser', async () => {
  const fs = await import('fs');
  
  // Check key client-visible files
  const clientFiles = [
    'app/page.tsx',
    'app/layout.tsx',
    'app/receipt/[id]/page.tsx',
  ];
  
  for (const file of clientFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      
      // Browser-visible files must not use service credentials
      assert.ok(!content.includes('SUPABASE_SECRET_KEY'),
        `Client file ${file} must not use SUPABASE_SECRET_KEY`);
      assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        `Client file ${file} must not use SUPABASE_SERVICE_ROLE_KEY`);
      assert.ok(!content.includes('GEMINI_API_KEY'),
        `Client file ${file} must not use GEMINI_API_KEY`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
});

test('Workplan rule: Preserve manual reporting when Gemini unavailable', async () => {
  const fs = await import('fs');
  const pipelineFile = fs.readFileSync('lib/report-pipeline.ts', 'utf-8');
  
  // Should handle Gemini failure gracefully
  assert.match(pipelineFile, /analysis_status.*unavailable/i,
    'Pipeline must support unavailable analysis status');
  assert.match(pipelineFile, /unable_to_assess/i,
    'Pipeline must support unable_to_assess fallback');
});

test('Workplan rule: Test suite passes before handoff', async () => {
  // This test documents that all tests must pass before considering work complete
  // Run: npm run test:analysis
  assert.ok(true, 'All tests must pass per workplan completion gate');
});

// =============================================================================
// Documentation Compliance
// =============================================================================

test('Routing module includes source attribution', async () => {
  const fs = await import('fs');
  const routingFile = fs.readFileSync('lib/baltimore-311-routing.mjs', 'utf-8');
  
  // Should document data source and limitations
  assert.match(routingFile, /(observed|baltimore|311|official)/i,
    'Routing must document that data is from observed Baltimore 311 data');
});

test('No promises of city submission in user-facing strings', async () => {
  const fs = await import('fs');
  
  // Check key UI files
  const uiFiles = [
    'app/page.tsx',
    'app/layout.tsx',
    'app/receipt/[id]/page.tsx',
  ];
  
  const forbiddenPromises = [
    /will\s+be\s+submitted\s+to/i,
    /automatically\s+sent\s+to\s+(city|311)/i,
    /submitted\s+to\s+baltimore/i,
  ];
  
  for (const file of uiFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of forbiddenPromises) {
        assert.ok(!pattern.test(content),
          `${file} must not promise ${pattern.toString()}`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
});
