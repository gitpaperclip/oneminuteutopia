export const INCIDENT_TYPES_BY_CATEGORY = Object.freeze({
  roads_and_sidewalks: Object.freeze([
    'pothole', 'road_surface_damage', 'alley_surface_damage', 'sidewalk_damage',
    'ada_sidewalk_ramp_damage', 'curb_damage', 'bridge_damage', 'guardrail_damage',
    'street_cut_damage', 'steel_plate_hazard', 'road_obstruction', 'road_debris',
    'barricade_issue', 'fence_damage', 'snow_or_ice_road', 'snow_or_ice_sidewalk',
    'scooter_or_ebike_issue', 'bench_damage', 'abandoned_vehicle', 'parking_violation',
    'parking_meter_issue', 'accessibility_obstruction', 'roads_and_sidewalks_unspecified',
  ]),
  traffic_signals_and_streetlights: Object.freeze([
    'traffic_signal_damage', 'traffic_signal_timing', 'traffic_sign_damage',
    'missing_traffic_sign', 'street_marking_damage', 'crosswalk_damage',
    'flex_post_damage', 'streetlight_outage', 'streetlight_damage',
    'streetlight_cover_missing', 'streetlight_missing', 'streetlight_brightness',
    'traffic_signals_and_streetlights_unspecified',
  ]),
  trash_and_sanitation: Object.freeze([
    'illegal_dumping', 'overflowing_trash', 'abandoned_bulk_waste', 'appliance_disposal',
    'dirty_alley', 'dirty_street', 'missed_trash_or_recycling',
    'trash_or_recycling_container_issue', 'public_trash_can_issue', 'dumpster_issue',
    'leaf_debris', 'fire_debris', 'graffiti', 'syringe_or_sharps',
    'waterway_trash', 'dead_animal',
    'trash_and_sanitation_unspecified',
  ]),
  water_drainage_and_sewage: Object.freeze([
    'street_flooding', 'standing_water', 'water_main_leak', 'water_meter_leak',
    'water_meter_cover_damage', 'hydrant_damage', 'hydrant_leak', 'open_hydrant',
    'sewer_overflow', 'basement_sewage', 'blocked_storm_drain',
    'damaged_storm_inlet', 'erosion_or_sediment', 'waterway_pollution',
    'discolored_water', 'water_surface_repair', 'water_drainage_and_sewage_unspecified',
  ]),
  trees_and_public_spaces: Object.freeze([
    'fallen_tree_or_branch', 'broken_branch_in_tree', 'damaged_tree',
    'tree_maintenance', 'park_damage', 'playground_damage', 'ball_field_damage',
    'park_building_damage', 'overgrown_public_grass',
    'trees_and_public_spaces_unspecified',
  ]),
  buildings_and_construction: Object.freeze([
    'unsafe_building', 'building_maintenance_violation', 'construction_hazard',
    'building_permit_violation', 'demolition_hazard', 'vacant_property_hazard',
    'zoning_violation', 'illegal_sign_or_flyer', 'fire_code_violation',
    'property_pest_infestation', 'property_sanitation',
    'buildings_and_construction_unspecified',
  ]),
  electricity_and_gas: Object.freeze([
    'downed_power_line', 'exposed_wiring', 'damaged_utility_equipment',
    'debris_on_wire_or_pole', 'conduit_damage',
    'electricity_and_gas_unspecified',
  ]),
  animals: Object.freeze([
    'injured_or_abused_animal', 'loose_or_aggressive_animal', 'animal_attack',
    'stray_animal_held', 'trapped_animal', 'animal_unsanitary_conditions',
    'wildlife_complaint', 'animals_unspecified',
  ]),
  fire_injury_or_immediate_threat: Object.freeze([
    'structure_fire', 'vehicle_fire', 'garbage_fire', 'brush_fire',
    'smoke_unknown_source', 'visible_injury', 'immediate_threat_other',
    'fire_injury_or_immediate_threat_unspecified',
  ]),
  other_hazard: Object.freeze([
    'noise_complaint', 'odor_complaint', 'dust_complaint', 'pesticide_concern',
    'smoking_or_tobacco_violation', 'public_pool_or_spa_concern',
    'food_facility_concern', 'waste_hauler_concern', 'liquor_license_concern',
    'other_hazard',
  ]),
  no_visible_hazard: Object.freeze(['no_visible_hazard']),
  unable_to_assess: Object.freeze(['unable_to_assess']),
});

export const INCIDENT_TYPES = Object.freeze(Object.values(INCIDENT_TYPES_BY_CATEGORY).flat());

export const CONTEXT_TAGS = Object.freeze([
  'active_flames', 'smoke', 'trash', 'vehicle', 'building', 'roadway', 'sidewalk',
  'intersection', 'utility_line', 'utility_pole', 'traffic_control', 'standing_water',
  'sewage', 'tree_or_branch', 'public_space', 'animal', 'construction', 'debris',
  'blocks_travel', 'pedestrian_exposure', 'vehicle_exposure', 'occupied_area',
  'alley', 'parking_space', 'hydrant', 'storm_drain', 'vacant_property',
  'graffiti', 'snow_or_ice', 'animal_waste', 'playground', 'food_facility',
]);

export function incidentTypeMatchesCategory(category, incidentType) {
  return INCIDENT_TYPES_BY_CATEGORY[category]?.includes(incidentType) ?? false;
}

export function fallbackIncidentType(category) {
  const values = INCIDENT_TYPES_BY_CATEGORY[category];
  if (!values) return 'other_hazard';
  return values.find(value => value.endsWith('_unspecified')) ?? values[0];
}

export function normalizedTags(incidentType, contextTags = []) {
  return [...new Set([incidentType, ...contextTags])].sort();
}
