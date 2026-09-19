import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINATIONS,
  selectDestination,
  getDestination,
  getAllDestinations,
  formatRoutingDisplay,
} from '../lib/baltimore-311-routing.mjs';

test('DESTINATIONS contains expected core agencies', () => {
  // Emergency
  assert.ok(DESTINATIONS['911']);
  assert.equal(DESTINATIONS['911'].phone, '911');

  // City agencies
  assert.ok(DESTINATIONS['311']);
  assert.equal(DESTINATIONS['311'].jurisdiction, 'city');
  assert.ok(DESTINATIONS.BCDOT);
  assert.ok(DESTINATIONS.DPW);
  assert.ok(DESTINATIONS.DHCD);
  assert.ok(DESTINATIONS.BCHD);
  assert.ok(DESTINATIONS['Recreation & Parks']);

  // Utilities
  assert.ok(DESTINATIONS.BGE);
  assert.equal(DESTINATIONS.BGE.jurisdiction, 'utility');

  // State
  assert.ok(DESTINATIONS.MTA);
  assert.ok(DESTINATIONS.MDE);
  assert.equal(DESTINATIONS.MTA.jurisdiction, 'state');
});

test('all destinations have required fields', () => {
  const destinations = getAllDestinations();
  assert.ok(destinations.length > 0);

  for (const dest of destinations) {
    assert.ok(dest.id);
    assert.ok(dest.displayName);
    assert.ok(dest.jurisdiction);
    assert.ok(dest.description);
    assert.equal(dest.requiresHumanConfirmation, true);
    assert.ok(dest.lastVerified);
    
    // lastVerified should be ISO date format
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(dest.lastVerified));
  }
});

test('getDestination retrieves destinations by ID', () => {
  const dest311 = getDestination('311');
  assert.equal(dest311.displayName, 'Baltimore 311');
  assert.equal(dest311.intakeUrl, 'https://balt311.baltimorecity.gov/');

  const bge = getDestination('BGE');
  assert.equal(bge.displayName, 'Baltimore Gas and Electric');

  assert.equal(getDestination('INVALID'), null);
  assert.equal(getDestination(null), null);
});

test('selectDestination routes emergencies to 911', () => {
  // Fire/injury category
  const fire = selectDestination({ category: 'fire_injury_or_immediate_threat', seriousness: 5 });
  assert.equal(fire.destination.id, '911');
  assert.equal(fire.urgency, 'emergency');
  assert.equal(fire.requiresImmediate, true);

  // Electricity/gas category
  const gas = selectDestination({ category: 'electricity_and_gas', seriousness: 7 });
  assert.equal(gas.destination.id, 'BGE');
  assert.equal(gas.urgency, 'urgent');

  // High seriousness (9-10)
  const highSeriousness = selectDestination({ category: 'roads_and_sidewalks', seriousness: 10 });
  assert.equal(highSeriousness.destination.id, '911');
  assert.equal(highSeriousness.urgency, 'emergency');
  assert.equal(highSeriousness.requiresImmediate, true);
});

test('selectDestination routes routine issues to correct agencies', () => {
  // Roads to BCDOT/311
  const pothole = selectDestination({ category: 'roads_and_sidewalks', seriousness: 3 });
  assert.equal(pothole.destination.id, '311');
  assert.equal(pothole.urgency, 'routine');
  assert.equal(pothole.requiresImmediate, false);
  assert.ok(pothole.alternates.some(a => a.id === 'BCDOT'));

  // Trash to DPW/311
  const trash = selectDestination({ category: 'trash_and_sanitation', seriousness: 2 });
  assert.equal(trash.destination.id, '311');
  assert.ok(trash.alternates.some(a => a.id === 'DPW'));

  // Buildings to DHCD
  const building = selectDestination({ category: 'buildings_and_construction', seriousness: 6 });
  assert.equal(building.destination.id, 'DHCD');
  assert.equal(building.urgency, 'urgent');
});

test('selectDestination handles subcategory routing refinements', () => {
  // Other hazard with food subcategory → BCHD
  const food = selectDestination({
    category: 'other_hazard',
    seriousness: 4,
    subcategory: 'food',
  });
  assert.equal(food.destination.id, 'BCHD');
  assert.ok(food.reason.includes('Health Department'));

  // Other hazard with pollution → MDE
  const pollution = selectDestination({
    category: 'other_hazard',
    seriousness: 5,
    subcategory: 'pollution',
  });
  assert.equal(pollution.destination.id, 'MDE');
  assert.ok(pollution.reason.includes('Environment'));

  // Other hazard with transit → MTA
  const transit = selectDestination({
    category: 'other_hazard',
    seriousness: 3,
    subcategory: 'transit',
  });
  assert.equal(transit.destination.id, 'MTA');
  assert.ok(transit.reason.includes('MTA'));

  // Other hazard without subcategory → 311
  const generic = selectDestination({
    category: 'other_hazard',
    seriousness: 3,
  });
  assert.equal(generic.destination.id, '311');
});

test('selectDestination handles no visible hazard', () => {
  const result = selectDestination({ category: 'no_visible_hazard', seriousness: 0 });
  assert.equal(result.destination, null);
  assert.ok(result.reason.includes('No visible hazard'));
  assert.equal(result.urgency, 'none');
  assert.equal(result.requiresImmediate, false);
  assert.equal(result.alternates.length, 0);
});

test('selectDestination handles unable to assess', () => {
  const result = selectDestination({ category: 'unable_to_assess', seriousness: null });
  assert.equal(result.destination.id, '311');
  assert.ok(result.reason.includes('Unable to determine') || result.reason.includes('311'));
  assert.equal(result.urgency, null);
  assert.equal(result.requiresImmediate, false);
});

test('selectDestination handles unknown categories', () => {
  const result = selectDestination({ category: 'unknown_category', seriousness: 5 });
  assert.equal(result.destination.id, '311');
  assert.ok(result.reason.includes('Unknown category'));
  assert.equal(result.urgency, 'urgent');
});

test('selectDestination urgency levels match seriousness', () => {
  // Routine (1-4)
  const routine = selectDestination({ category: 'roads_and_sidewalks', seriousness: 3 });
  assert.equal(routine.urgency, 'routine');
  assert.equal(routine.requiresImmediate, false);

  // Urgent (5-8)
  const urgent = selectDestination({ category: 'roads_and_sidewalks', seriousness: 6 });
  assert.equal(urgent.urgency, 'urgent');
  // Non-emergency categories can be urgent but not require *immediate* 911
  // but still requiresImmediate due to urgency level
  assert.equal(urgent.requiresImmediate, true);

  // Emergency (9-10)
  const emergency = selectDestination({ category: 'roads_and_sidewalks', seriousness: 9 });
  assert.equal(emergency.urgency, 'emergency');
  assert.equal(emergency.requiresImmediate, true);
  assert.equal(emergency.destination.id, '911');
});

test('selectDestination includes alternates from agencies', () => {
  const result = selectDestination({ category: 'trees_and_public_spaces', seriousness: 3 });
  
  // Should have destination
  assert.ok(result.destination);
  
  // Should have alternates (from agencies list)
  assert.ok(result.alternates.length > 0);
  
  // Alternates should not include the primary destination
  const alternateIds = result.alternates.map(a => a.id);
  assert.ok(!alternateIds.includes(result.destination.id));
});

test('formatRoutingDisplay creates display-friendly output', () => {
  const routing = selectDestination({ category: 'roads_and_sidewalks', seriousness: 3 });
  const display = formatRoutingDisplay(routing);

  assert.ok(display.primary);
  assert.equal(display.primary.name, 'Baltimore 311');
  assert.ok(display.primary.url);
  assert.ok(display.message);
  assert.equal(display.urgency, 'routine');
  assert.ok(display.callToAction);
  assert.ok(Array.isArray(display.alternates));
});

test('formatRoutingDisplay handles emergency call to action', () => {
  const routing = selectDestination({ category: 'fire_injury_or_immediate_threat', seriousness: 8 });
  const display = formatRoutingDisplay(routing);

  assert.equal(display.primary.name, '911 Emergency');
  assert.ok(display.callToAction.includes('911'));
  assert.ok(display.callToAction.includes('immediately'));
});

test('formatRoutingDisplay handles no destination', () => {
  const routing = selectDestination({ category: 'no_visible_hazard', seriousness: 0 });
  const display = formatRoutingDisplay(routing);

  assert.equal(display.primary, null);
  assert.ok(display.message.includes('No visible hazard'));
  assert.equal(display.callToAction, null);
});

test('destinations have proper fallback chains', () => {
  // City departments should fallback to 311
  const cityDepts = ['BCDOT', 'DPW', 'DHCD', 'BCHD', 'Recreation & Parks', 'Animal Control'];
  for (const deptId of cityDepts) {
    const dept = getDestination(deptId);
    if (dept && dept.fallbackTo) {
      assert.equal(dept.fallbackTo, '311');
    }
  }

  // 911 has no fallback
  assert.equal(DESTINATIONS['911'].fallbackTo, undefined);

  // BGE (utility) has no fallback to 311
  assert.equal(DESTINATIONS.BGE.fallbackTo, undefined);
});

test('all city destinations require human confirmation', () => {
  const destinations = getAllDestinations();
  for (const dest of destinations) {
    assert.equal(dest.requiresHumanConfirmation, true,
      `${dest.id} should require human confirmation`);
  }
});

test('destinations are properly categorized by jurisdiction', () => {
  const cityJurisdictions = ['911', '311', 'BCDOT', 'DPW', 'DHCD', 'BCHD', 'Recreation & Parks', 'Animal Control'];
  for (const id of cityJurisdictions) {
    const dest = getDestination(id);
    assert.equal(dest.jurisdiction, 'city', `${id} should be city jurisdiction`);
  }

  assert.equal(getDestination('BGE').jurisdiction, 'utility');
  assert.equal(getDestination('MTA').jurisdiction, 'state');
  assert.equal(getDestination('MDE').jurisdiction, 'state');
});

test('selectDestination is deterministic with same inputs', () => {
  const inputs = { category: 'roads_and_sidewalks', seriousness: 5, subcategory: 'pothole' };
  
  const result1 = selectDestination(inputs);
  const result2 = selectDestination(inputs);
  
  assert.equal(result1.destination.id, result2.destination.id);
  assert.equal(result1.urgency, result2.urgency);
  assert.equal(result1.requiresImmediate, result2.requiresImmediate);
  assert.equal(result1.alternates.length, result2.alternates.length);
});

test('DESTINATIONS is frozen and immutable', () => {
  assert.throws(() => {
    DESTINATIONS['311'] = { modified: true };
  });
  
  assert.throws(() => {
    DESTINATIONS.NEW_DEST = {};
  });
});
