import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDescription,
  buildTitle,
  buildSummary,
  buildReportFields,
  validateDescriptionInput,
  buildEmergencyGuidance,
} from '../lib/description-builder.mjs';

test('buildDescription creates structured description', () => {
  const desc = buildDescription({
    category: 'roads_and_sidewalks',
    seriousness: 6,
    aiConfidence: 85,
    subcategory: 'pothole',
    userDescription: 'Large pothole causing traffic issues',
    locationAddress: '123 Main St, Baltimore, MD',
    locationSource: 'gps',
    categoryWasCorrected: false,
  });

  assert.ok(desc.includes('Issue type: Roads and sidewalks - pothole'));
  assert.ok(desc.includes('Priority: Urgent'));
  assert.ok(desc.includes('AI assessment: seriousness 6/10, confidence 85%'));
  assert.ok(desc.includes('Reporter description:'));
  assert.ok(desc.includes('Large pothole causing traffic issues'));
  assert.ok(desc.includes('Location: 123 Main St, Baltimore, MD'));
  assert.ok(desc.includes('(GPS coordinates provided)'));
  assert.ok(desc.includes('Reported:'));
  assert.ok(desc.includes('Source: One Minute Utopia'));
});

test('buildDescription handles corrected category', () => {
  const desc = buildDescription({
    category: 'trash_and_sanitation',
    seriousness: 3,
    aiConfidence: 60,
    categoryWasCorrected: true,
  });

  assert.ok(desc.includes('(Category corrected by reporter)'));
});

test('buildDescription handles unable to assess', () => {
  const desc = buildDescription({
    category: 'unable_to_assess',
    seriousness: null,
    aiConfidence: 0,
    userDescription: 'Street sign damaged',
  });

  assert.ok(desc.includes('Unable to assess'));
  assert.ok(desc.includes('AI was unable to assess this image'));
  assert.ok(desc.includes('Category selected manually by reporter'));
  assert.ok(desc.includes('Street sign damaged'));
});

test('buildDescription handles no visible hazard', () => {
  const desc = buildDescription({
    category: 'no_visible_hazard',
    seriousness: 0,
    aiConfidence: 95,
  });

  assert.ok(desc.includes('No visible hazard'));
  assert.ok(!desc.includes('Priority'));
});

test('buildDescription includes urgency labels', () => {
  const routine = buildDescription({
    category: 'roads_and_sidewalks',
    seriousness: 2,
    aiConfidence: 80,
  });
  assert.ok(routine.includes('Priority: Routine maintenance'));

  const urgent = buildDescription({
    category: 'roads_and_sidewalks',
    seriousness: 7,
    aiConfidence: 80,
  });
  assert.ok(urgent.includes('Priority: Urgent'));

  const emergency = buildDescription({
    category: 'roads_and_sidewalks',
    seriousness: 10,
    aiConfidence: 90,
  });
  assert.ok(emergency.includes('Priority: Emergency (life-threatening)'));
});

test('buildDescription handles manual location', () => {
  const desc = buildDescription({
    category: 'trash_and_sanitation',
    seriousness: 3,
    aiConfidence: 75,
    locationAddress: 'Corner of Park Ave and North Ave',
    locationSource: 'manual',
  });

  assert.ok(desc.includes('Location: Corner of Park Ave and North Ave'));
  assert.ok(desc.includes('(Address entered manually)'));
});

test('buildDescription handles missing optional fields', () => {
  const desc = buildDescription({
    category: 'roads_and_sidewalks',
    seriousness: 4,
    aiConfidence: 70,
  });

  // Should still have basic structure
  assert.ok(desc.includes('Issue type: Roads and sidewalks'));
  assert.ok(desc.includes('AI assessment: seriousness 4/10'));
  assert.ok(desc.includes('Source: One Minute Utopia'));
  
  // Should not have optional sections
  assert.ok(!desc.includes('Reporter description:'));
  assert.ok(!desc.includes('Location:'));
});

test('buildTitle creates concise titles', () => {
  const title = buildTitle({
    category: 'roads_and_sidewalks',
    subcategory: 'pothole',
    locationAddress: '123 Main St, Baltimore, MD',
  });

  assert.ok(title.includes('pothole'));
  assert.ok(title.includes('123 Main St'));
  assert.ok(title.length < 100);
});

test('buildTitle handles no subcategory', () => {
  const title = buildTitle({
    category: 'other_hazard',
    locationAddress: 'Park Avenue',
  });

  assert.ok(title.includes('Other hazard'));
  assert.ok(title.includes('Park Avenue'));
});

test('buildTitle handles no location', () => {
  const title = buildTitle({
    category: 'trash_and_sanitation',
    subcategory: 'dumping',
  });

  assert.equal(title, 'dumping - Trash and sanitation');
});

test('buildTitle truncates long addresses', () => {
  const longAddress = 'A'.repeat(200) + ', Baltimore, MD';
  const title = buildTitle({
    category: 'roads_and_sidewalks',
    subcategory: 'pothole',
    locationAddress: longAddress,
  });

  assert.ok(title.length <= 100);
  assert.ok(title.endsWith('...') || title.length < 100);
});

test('buildSummary creates one-line summaries', () => {
  const summary = buildSummary({
    category: 'roads_and_sidewalks',
    seriousness: 3,
    subcategory: 'pothole',
  });

  assert.ok(summary.includes('Roads and sidewalks'));
  assert.ok(summary.includes('pothole'));
  assert.ok(!summary.includes('\n'));
});

test('buildSummary includes urgency markers', () => {
  const emergency = buildSummary({
    category: 'buildings_and_construction',
    seriousness: 9,
  });
  assert.ok(emergency.includes('[EMERGENCY]'));

  const urgent = buildSummary({
    category: 'water_drainage_and_sewage',
    seriousness: 6,
  });
  assert.ok(urgent.includes('[URGENT]'));

  const routine = buildSummary({
    category: 'trash_and_sanitation',
    seriousness: 2,
  });
  assert.ok(!routine.includes('[URGENT]'));
  assert.ok(!routine.includes('[EMERGENCY]'));
});

test('buildSummary handles special categories', () => {
  const unableToAssess = buildSummary({ category: 'unable_to_assess' });
  assert.ok(unableToAssess.includes('Unable to assess'));
  assert.ok(unableToAssess.includes('manual category needed'));

  const noHazard = buildSummary({ category: 'no_visible_hazard', seriousness: 0 });
  assert.ok(noHazard.includes('No visible hazard'));
});

test('buildReportFields creates human-readable fields (NO API submission)', () => {
  const fields = buildReportFields({
    category: 'roads_and_sidewalks',
    subcategory: 'pothole',
    userDescription: 'Large pothole',
    latitude: 39.2904,
    longitude: -76.6122,
    locationAddress: '123 Main St',
  });

  assert.equal(fields.issue_type, 'pothole');
  assert.equal(fields.description, 'Large pothole');
  assert.equal(fields.latitude, 39.2904);
  assert.equal(fields.longitude, -76.6122);
  assert.equal(fields.address, '123 Main St');
  assert.ok(fields.photo_note.includes('Photo available'));
});

test('buildReportFields uses category when no subcategory', () => {
  const fields = buildReportFields({
    category: 'other_hazard',
    userDescription: 'Hazardous condition',
  });

  assert.equal(fields.issue_type, 'other_hazard');
  assert.equal(fields.description, 'Hazardous condition');
});

test('buildReportFields handles missing description', () => {
  const fields = buildReportFields({
    category: 'trash_and_sanitation',
  });

  assert.ok(fields.description.includes('Trash and sanitation'));
  assert.ok(fields.description.includes('photo'));
});

test('validateDescriptionInput accepts valid input', () => {
  const result = validateDescriptionInput('This is a valid description');
  assert.equal(result.valid, true);
  assert.equal(result.sanitized, 'This is a valid description');
});

test('validateDescriptionInput handles null and empty', () => {
  const nullResult = validateDescriptionInput(null);
  assert.equal(nullResult.valid, true);
  assert.equal(nullResult.sanitized, null);

  const emptyResult = validateDescriptionInput('   ');
  assert.equal(emptyResult.valid, true);
  assert.equal(emptyResult.sanitized, null);
});

test('validateDescriptionInput rejects non-string', () => {
  const result = validateDescriptionInput(123);
  assert.equal(result.valid, false);
  assert.ok(result.error);
});

test('validateDescriptionInput rejects too long', () => {
  const tooLong = 'A'.repeat(2001);
  const result = validateDescriptionInput(tooLong);
  assert.equal(result.valid, false);
  assert.ok(result.error.includes('too long'));
});

test('validateDescriptionInput sanitizes control characters', () => {
  const dirty = 'Hello\x00World\x1FTest\nNewline\tTab';
  const result = validateDescriptionInput(dirty);
  assert.equal(result.valid, true);
  assert.equal(result.sanitized, 'HelloWorldTest\nNewline\tTab');
  assert.ok(!result.sanitized.includes('\x00'));
  assert.ok(!result.sanitized.includes('\x1F'));
});

test('buildEmergencyGuidance returns guidance for fire/injury', () => {
  const guidance = buildEmergencyGuidance('fire_injury_or_immediate_threat', 8);
  assert.ok(guidance);
  assert.ok(guidance.includes('EMERGENCY'));
  assert.ok(guidance.includes('Call 911'));
  assert.ok(guidance.includes('immediately'));
  assert.ok(guidance.includes('Do not wait'));
});

test('buildEmergencyGuidance returns guidance for electricity/gas', () => {
  const guidance = buildEmergencyGuidance('electricity_and_gas', 5);
  assert.ok(guidance);
  assert.ok(guidance.includes('URGENT'));
  assert.ok(guidance.includes('Gas odor') || guidance.includes('downed power'));
  assert.ok(guidance.includes('Call 911'));
  assert.ok(guidance.includes('BGE'));
});

test('buildEmergencyGuidance returns guidance for high seriousness', () => {
  const guidance = buildEmergencyGuidance('buildings_and_construction', 10);
  assert.ok(guidance);
  assert.ok(guidance.includes('EMERGENCY'));
  assert.ok(guidance.includes('life-threatening'));
  assert.ok(guidance.includes('Call 911'));
});

test('buildEmergencyGuidance returns null for routine issues', () => {
  const guidance1 = buildEmergencyGuidance('roads_and_sidewalks', 3);
  assert.equal(guidance1, null);

  const guidance2 = buildEmergencyGuidance('trash_and_sanitation', 5);
  assert.equal(guidance2, null);

  const guidance3 = buildEmergencyGuidance('no_visible_hazard', 0);
  assert.equal(guidance3, null);
});

test('buildDescription is deterministic with same inputs', () => {
  const params = {
    category: 'roads_and_sidewalks',
    seriousness: 5,
    aiConfidence: 80,
    subcategory: 'pothole',
    userDescription: 'Test',
    locationAddress: '123 Main St',
    locationSource: 'gps',
  };

  const desc1 = buildDescription(params);
  const desc2 = buildDescription(params);

  // Descriptions will have different dates, so compare structure
  const lines1 = desc1.split('\n').filter(l => !l.includes('Reported:'));
  const lines2 = desc2.split('\n').filter(l => !l.includes('Reported:'));

  assert.deepEqual(lines1, lines2);
});

test('buildTitle replaces underscores in subcategories', () => {
  const title = buildTitle({
    category: 'buildings_and_construction',
    subcategory: 'vacant_building',
  });

  assert.ok(title.includes('vacant building'));
  assert.ok(!title.includes('vacant_building'));
});

test('buildSummary replaces underscores in subcategories', () => {
  const summary = buildSummary({
    category: 'water_drainage_and_sewage',
    seriousness: 4,
    subcategory: 'sewer_backup',
  });

  assert.ok(summary.includes('sewer backup'));
  assert.ok(!summary.includes('sewer_backup'));
});

test('buildDescription handles all urgency levels', () => {
  const none = buildDescription({ category: 'no_visible_hazard', seriousness: 0, aiConfidence: 90 });
  assert.ok(!none.includes('Priority:'));

  const routine = buildDescription({ category: 'roads_and_sidewalks', seriousness: 2, aiConfidence: 80 });
  assert.ok(routine.includes('Routine'));

  const urgent = buildDescription({ category: 'roads_and_sidewalks', seriousness: 6, aiConfidence: 80 });
  assert.ok(urgent.includes('Urgent'));

  const emergency = buildDescription({ category: 'roads_and_sidewalks', seriousness: 9, aiConfidence: 80 });
  assert.ok(emergency.includes('Emergency'));
});

test('validateDescriptionInput preserves newlines and basic formatting', () => {
  const multiline = 'Line 1\nLine 2\nLine 3';
  const result = validateDescriptionInput(multiline);
  assert.equal(result.valid, true);
  assert.ok(result.sanitized.includes('\n'));
  assert.equal(result.sanitized.split('\n').length, 3);
});
