import test from 'node:test';
import assert from 'node:assert/strict';
import {
  build311Description,
  sanitizeText,
  validateUserDescription,
  buildEmergencyGuidance,
} from '../lib/prepare-311-description.mjs';

test('build311Description creates complete formatted description', () => {
  const desc = build311Description({
    incident_type: 'pothole',
    context_summary: 'Large depression in asphalt roadway surface',
    context_tags: ['roadway', 'vehicle_exposure'],
    user_description: 'This has been here for weeks and is getting worse',
    evidence_count: 1,
    location_address: '123 Main St, Baltimore, MD',
  });

  assert.ok(desc.includes('Issue: Pothole'));
  assert.ok(desc.includes('AI observed:'));
  assert.ok(desc.includes('Large depression in asphalt roadway surface'));
  assert.ok(desc.includes('Reporter notes:'));
  assert.ok(desc.includes('This has been here for weeks'));
  assert.ok(desc.includes('Location: 123 Main St'));
  assert.ok(desc.includes('One Minute Utopia'));
});

test('build311Description handles super-reports with evidence count', () => {
  const desc = build311Description({
    incident_type: 'illegal_dumping',
    context_summary: 'Debris in alley',
    evidence_count: 3,
  });

  assert.ok(desc.includes('This represents 3 nearby reports of the same issue'));
});

test('build311Description avoids repeating tags mentioned in summary', () => {
  const desc = build311Description({
    incident_type: 'pothole',
    context_summary: 'Roadway damage with vehicle exposure',
    context_tags: ['roadway', 'vehicle_exposure', 'debris'],
  });

  // Summary contains "vehicle exposure", so it appears in AI observed section
  assert.ok(desc.includes('vehicle exposure'));
  
  // But tags that are already in summary should NOT appear in Additional details
  assert.ok(!desc.includes('Additional details: roadway'));
  assert.ok(!desc.includes('Additional details: roadway, vehicle exposure'));
  
  // Debris is NOT in summary, so it should appear in Additional details
  assert.ok(desc.includes('Additional details: debris'));
});

test('build311Description clearly separates AI vs user text', () => {
  const desc = build311Description({
    incident_type: 'graffiti',
    context_summary: 'Paint marks on wall',
    user_description: 'Offensive content, needs immediate removal',
  });

  const aiIndex = desc.indexOf('AI observed:');
  const userIndex = desc.indexOf('Reporter notes:');

  assert.ok(aiIndex > 0);
  assert.ok(userIndex > 0);
  assert.ok(userIndex > aiIndex); // User notes come after AI observations
  assert.ok(desc.substring(aiIndex, userIndex).includes('Paint marks on wall'));
  assert.ok(desc.substring(userIndex).includes('Offensive content'));
});

test('build311Description handles missing optional fields gracefully', () => {
  const desc = build311Description({
    incident_type: 'street_flooding',
  });

  assert.ok(desc.includes('Issue: Street Flooding'));
  assert.ok(desc.includes('One Minute Utopia'));
  assert.ok(!desc.includes('AI observed:'));
  assert.ok(!desc.includes('Reporter notes:'));
});

test('build311Description caps length at maximum', () => {
  const longSummary = 'A'.repeat(3000);
  const desc = build311Description({
    incident_type: 'pothole',
    context_summary: longSummary,
  });

  assert.ok(desc.length <= 2000);
  assert.ok(desc.endsWith('...'));
});

test('build311Description sanitizes all text fields', () => {
  const desc = build311Description({
    incident_type: 'pothole',
    context_summary: 'Summary with\x00control\x1Fchars',
    user_description: 'User <script>alert("xss")</script> text',
    location_address: 'Address\x00with\x1Fbad chars',
  });

  assert.ok(!desc.includes('\x00'));
  assert.ok(!desc.includes('\x1F'));
  assert.ok(!desc.includes('<script>'));
  assert.ok(!desc.includes('</script>'));
});

test('build311Description filters invalid context tags', () => {
  const desc = build311Description({
    incident_type: 'pothole',
    context_tags: ['roadway', 'invalid_tag', 'vehicle_exposure', 'fake_tag'],
  });

  // Valid tags should appear
  assert.ok(desc.includes('roadway') || desc.includes('vehicle exposure'));
  // Invalid tags should not appear
  assert.ok(!desc.includes('invalid_tag'));
  assert.ok(!desc.includes('fake_tag'));
});

test('sanitizeText removes control characters and normalizes whitespace', () => {
  const dirty = 'Hello\x00World\x1F\nNewline\tTab';
  const clean = sanitizeText(dirty);

  // Control characters removed, all whitespace (including \n and \t) normalized to single space
  assert.equal(clean, 'HelloWorld Newline Tab');
  assert.ok(!clean.includes('\x00'));
  assert.ok(!clean.includes('\x1F'));
  assert.ok(!clean.includes('\n'));
  assert.ok(!clean.includes('\t'));
});

test('sanitizeText removes HTML tags', () => {
  const html = 'Hello <b>bold</b> and <script>alert("xss")</script>';
  const clean = sanitizeText(html);

  assert.equal(clean, 'Hello bold and alert("xss")');
  assert.ok(!clean.includes('<'));
  assert.ok(!clean.includes('>'));
});

test('sanitizeText normalizes whitespace', () => {
  const messy = '  Multiple   spaces\n\n  and   lines  ';
  const clean = sanitizeText(messy);

  assert.equal(clean, 'Multiple spaces and lines');
});

test('sanitizeText handles null and empty', () => {
  assert.equal(sanitizeText(null), '');
  assert.equal(sanitizeText(''), '');
  assert.equal(sanitizeText('   '), '');
});

test('validateUserDescription accepts valid input', () => {
  const result = validateUserDescription('This is a valid description');
  assert.equal(result.valid, true);
  assert.equal(result.sanitized, 'This is a valid description');
});

test('validateUserDescription handles null and empty', () => {
  const nullResult = validateUserDescription(null);
  assert.equal(nullResult.valid, true);
  assert.equal(nullResult.sanitized, null);

  const emptyResult = validateUserDescription('   ');
  assert.equal(emptyResult.valid, true);
  assert.equal(emptyResult.sanitized, null);
});

test('validateUserDescription rejects non-string', () => {
  const result = validateUserDescription(123);
  assert.equal(result.valid, false);
  assert.ok(result.error);
});

test('validateUserDescription rejects too long', () => {
  const tooLong = 'A'.repeat(2001);
  const result = validateUserDescription(tooLong);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('too long'));
});

test('validateUserDescription sanitizes in result', () => {
  const dirty = 'Hello\x00World\x1F<b>bold</b>';
  const result = validateUserDescription(dirty);
  assert.equal(result.valid, true);
  assert.ok(!result.sanitized.includes('\x00'));
  assert.ok(!result.sanitized.includes('<b>'));
});

test('buildEmergencyGuidance returns guidance for fire/injury category', () => {
  const guidance = buildEmergencyGuidance('fire_injury_or_immediate_threat', 5);
  assert.ok(guidance);
  assert.ok(guidance.includes('EMERGENCY'));
  assert.ok(guidance.includes('Call 911'));
  assert.ok(guidance.includes('immediately'));
  assert.ok(guidance.includes('Do not wait'));
});

test('buildEmergencyGuidance returns guidance for high seriousness', () => {
  const guidance9 = buildEmergencyGuidance('buildings_and_construction', 9);
  assert.ok(guidance9);
  assert.ok(guidance9.includes('EMERGENCY'));
  assert.ok(guidance9.includes('life-threatening'));

  const guidance10 = buildEmergencyGuidance('roads_and_sidewalks', 10);
  assert.ok(guidance10);
  assert.ok(guidance10.includes('Call 911'));
});

test('buildEmergencyGuidance returns null for routine issues', () => {
  const guidance1 = buildEmergencyGuidance('pothole', 3);
  assert.equal(guidance1, null);

  const guidance2 = buildEmergencyGuidance('trash_and_sanitation', 5);
  assert.equal(guidance2, null);

  const guidance3 = buildEmergencyGuidance('no_visible_hazard', 0);
  assert.equal(guidance3, null);
});

test('build311Description converts incident types to human-readable labels', () => {
  const desc1 = build311Description({ incident_type: 'pothole' });
  assert.ok(desc1.includes('Issue: Pothole'));

  const desc2 = build311Description({ incident_type: 'illegal_dumping' });
  assert.ok(desc2.includes('Issue: Illegal Dumping'));

  const desc3 = build311Description({ incident_type: 'water_main_leak' });
  assert.ok(desc3.includes('Issue: Water Main Leak'));

  const desc4 = build311Description({ incident_type: 'ada_sidewalk_ramp_damage' });
  assert.ok(desc4.includes('Issue: Ada Sidewalk Ramp Damage'));
});

test('build311Description is deterministic with same inputs', () => {
  const params = {
    incident_type: 'pothole',
    context_summary: 'Test summary',
    context_tags: ['roadway'],
    user_description: 'Test description',
    location_address: '123 Main St',
  };

  const desc1 = build311Description(params);
  const desc2 = build311Description(params);

  assert.equal(desc1, desc2);
});

test('build311Description handles empty arrays and null values', () => {
  const desc = build311Description({
    incident_type: 'pothole',
    context_summary: null,
    context_tags: [],
    user_description: null,
    evidence_count: 1,
    location_address: null,
  });

  assert.ok(desc.includes('Issue: Pothole'));
  assert.ok(desc.includes('One Minute Utopia'));
  // Should not include empty sections
  const lines = desc.split('\n').filter(l => l.trim());
  assert.ok(lines.length < 5); // Just issue, source, maybe one more
});
