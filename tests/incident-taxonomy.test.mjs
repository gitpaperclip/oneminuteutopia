import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALTIMORE_TAXONOMY,
  getTaxonomy,
  requiresEmergency,
  getUrgency,
  validateSubcategory,
  getCategories,
} from '../lib/incident-taxonomy.mjs';

test('taxonomy contains all expected categories', () => {
  const expectedCategories = [
    'roads_and_sidewalks',
    'traffic_signals_and_streetlights',
    'trash_and_sanitation',
    'water_drainage_and_sewage',
    'trees_and_public_spaces',
    'buildings_and_construction',
    'electricity_and_gas',
    'animals',
    'fire_injury_or_immediate_threat',
    'other_hazard',
    'no_visible_hazard',
    'unable_to_assess',
  ];

  const categories = getCategories();
  assert.equal(categories.length, expectedCategories.length);
  for (const cat of expectedCategories) {
    assert.ok(categories.includes(cat), `Missing category: ${cat}`);
  }
});

test('getTaxonomy returns correct taxonomy for valid categories', () => {
  const roads = getTaxonomy('roads_and_sidewalks');
  assert.equal(roads.displayName, 'Roads and sidewalks');
  assert.equal(roads.defaultDestination, '311');
  assert.ok(roads.subcategories.includes('pothole'));
  assert.ok(roads.agencies.includes('BCDOT'));

  const fire = getTaxonomy('fire_injury_or_immediate_threat');
  assert.equal(fire.defaultDestination, '911');
  assert.equal(fire.noAutomatedSubmission, true);
});

test('getTaxonomy returns null for invalid input', () => {
  assert.equal(getTaxonomy(null), null);
  assert.equal(getTaxonomy(''), null);
  assert.equal(getTaxonomy('unknown_category'), null);
  assert.equal(getTaxonomy(123), null);
});

test('requiresEmergency identifies immediate threats', () => {
  // Fire/injury always emergency
  assert.equal(requiresEmergency('fire_injury_or_immediate_threat', 5), true);
  assert.equal(requiresEmergency('fire_injury_or_immediate_threat', null), true);

  // High seriousness (9-10) is emergency
  assert.equal(requiresEmergency('buildings_and_construction', 9), true);
  assert.equal(requiresEmergency('roads_and_sidewalks', 10), true);

  // Electricity/gas routes to BGE, not directly to 911 (unless seriousness >= 9)
  assert.equal(requiresEmergency('electricity_and_gas', 3), false);
  assert.equal(requiresEmergency('electricity_and_gas', 8), false);
  assert.equal(requiresEmergency('electricity_and_gas', 9), true);

  // Lower seriousness not emergency
  assert.equal(requiresEmergency('roads_and_sidewalks', 8), false);
  assert.equal(requiresEmergency('trash_and_sanitation', 5), false);
  assert.equal(requiresEmergency('trash_and_sanitation', null), false);
});

test('getUrgency maps seriousness to urgency levels', () => {
  // Emergency: 9-10
  assert.equal(getUrgency(9), 'emergency');
  assert.equal(getUrgency(10), 'emergency');

  // Urgent: 5-8
  assert.equal(getUrgency(5), 'urgent');
  assert.equal(getUrgency(6), 'urgent');
  assert.equal(getUrgency(7), 'urgent');
  assert.equal(getUrgency(8), 'urgent');

  // Routine: 1-4
  assert.equal(getUrgency(1), 'routine');
  assert.equal(getUrgency(2), 'routine');
  assert.equal(getUrgency(3), 'routine');
  assert.equal(getUrgency(4), 'routine');

  // None: 0
  assert.equal(getUrgency(0), 'none');

  // Null
  assert.equal(getUrgency(null), null);
});

test('validateSubcategory validates against taxonomy', () => {
  // Valid subcategories
  assert.equal(validateSubcategory('roads_and_sidewalks', 'pothole'), 'pothole');
  assert.equal(validateSubcategory('roads_and_sidewalks', 'sinkhole'), 'sinkhole');
  assert.equal(validateSubcategory('trash_and_sanitation', 'dumping'), 'dumping');
  assert.equal(validateSubcategory('buildings_and_construction', 'vacant_building'), 'vacant_building');

  // Invalid subcategories
  assert.equal(validateSubcategory('roads_and_sidewalks', 'invalid'), null);
  assert.equal(validateSubcategory('roads_and_sidewalks', 'dumping'), null); // Wrong category
  assert.equal(validateSubcategory('unknown_category', 'pothole'), null);

  // Normalization
  assert.equal(validateSubcategory('roads_and_sidewalks', 'POTHOLE'), 'pothole');
  assert.equal(validateSubcategory('roads_and_sidewalks', 'Pot Hole!'), 'pothole');

  // Edge cases
  assert.equal(validateSubcategory(null, 'pothole'), null);
  assert.equal(validateSubcategory('roads_and_sidewalks', null), null);
  assert.equal(validateSubcategory('roads_and_sidewalks', ''), null);
});

test('subcategories are properly defined for each category', () => {
  // Roads should have expected subcategories
  const roads = getTaxonomy('roads_and_sidewalks');
  assert.ok(roads.subcategories.includes('pothole'));
  assert.ok(roads.subcategories.includes('sidewalk'));
  assert.ok(roads.subcategories.includes('sinkhole'));

  // Traffic signals should have expected subcategories
  const traffic = getTaxonomy('traffic_signals_and_streetlights');
  assert.ok(traffic.subcategories.includes('signal_out'));
  assert.ok(traffic.subcategories.includes('dark_streetlight'));

  // No visible hazard has no subcategories
  const noHazard = getTaxonomy('no_visible_hazard');
  assert.equal(noHazard.subcategories.length, 0);
});

test('escalation rules are defined for all categories', () => {
  const categories = getCategories();
  for (const cat of categories) {
    const taxonomy = getTaxonomy(cat);
    assert.ok(taxonomy, `Taxonomy missing for ${cat}`);
    
    // Check structure
    assert.ok('displayName' in taxonomy);
    assert.ok('subcategories' in taxonomy);
    assert.ok('defaultDestination' in taxonomy);
    assert.ok('escalateWhen' in taxonomy);
    assert.ok('escalateTo' in taxonomy);
    assert.ok('agencies' in taxonomy);

    // Agencies should be an array
    assert.ok(Array.isArray(taxonomy.agencies));
  }
});

test('taxonomy is frozen and immutable', () => {
  assert.throws(() => {
    BALTIMORE_TAXONOMY.roads_and_sidewalks = { modified: true };
  });
  
  assert.throws(() => {
    BALTIMORE_TAXONOMY.new_category = {};
  });
});

test('emergency categories have correct flags', () => {
  const fire = getTaxonomy('fire_injury_or_immediate_threat');
  assert.equal(fire.defaultDestination, '911');
  assert.equal(fire.escalateTo, '911');
  assert.equal(fire.noAutomatedSubmission, true);

  const gas = getTaxonomy('electricity_and_gas');
  assert.equal(gas.defaultDestination, 'BGE');
  assert.equal(gas.escalateTo, '911');
  assert.ok(gas.agencies.includes('911'));
});

test('all categories have proper 311 fallback paths', () => {
  const categories = getCategories();
  for (const cat of categories) {
    const taxonomy = getTaxonomy(cat);
    
    // Skip special categories
    if (cat === 'no_visible_hazard') continue;
    
    // Should have either a destination or be emergency
    if (taxonomy.defaultDestination === null) {
      assert.equal(cat, 'no_visible_hazard');
    } else {
      // Non-null destination should be valid
      assert.ok(taxonomy.defaultDestination.length > 0);
    }
    
    // Agencies should include destination or 311
    if (taxonomy.agencies.length > 0 && taxonomy.defaultDestination) {
      const has311OrDestination = taxonomy.agencies.includes('311') || 
                                   taxonomy.agencies.includes(taxonomy.defaultDestination);
      if (!has311OrDestination && cat !== 'fire_injury_or_immediate_threat') {
        // Fire is exception - goes direct to 911
        assert.fail(`${cat} missing fallback path`);
      }
    }
  }
});
