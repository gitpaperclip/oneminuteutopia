import { INCIDENT_TYPES } from './incident-taxonomy.mjs';

const route = (serviceTypes, disposition = '311') => Object.freeze({
  service_types: Object.freeze(serviceTypes), disposition,
});

// Exact SRType values observed in Baltimore's official current-year 311 dataset.
// These are routing candidates, not an authorization to submit without user review.
export const BALTIMORE_311_ROUTES = Object.freeze({
  pothole: route(['TRM-Potholes', 'TRM-Pickup Pothole']),
  road_surface_damage: route(['TRM-Street Repairs', 'TEC-Street Repair (Misc)']),
  alley_surface_damage: route(['TRM-Alleys', 'TEC-Alley Reconstruction Complaint']),
  sidewalk_damage: route(['TRM-Footways Repair', 'TEC-Footways Complaint']),
  ada_sidewalk_ramp_damage: route(['TRM-(ADA) Sidewalk Ramp Concern (Repair)']),
  curb_damage: route(['TRM-Curb Repair']),
  bridge_damage: route(['TRM-Bridge Concern']),
  guardrail_damage: route(['TRM-Guardrail Concern (Repair)']),
  street_cut_damage: route(['TR-Street Cut Issues']),
  steel_plate_hazard: route(['TR-Steel Plate Complaint']),
  road_obstruction: route(['TRM-Debris In Roadway']),
  road_debris: route(['TRM-Debris In Roadway']),
  barricade_issue: route(['TRM-Barricades-Install', 'TRM-Barricades-Removal'], 'manual_review'),
  fence_damage: route(['TRM-Fence Concern (Repair)']),
  snow_or_ice_road: route(['TRM-Snow/Icy Conditions']),
  snow_or_ice_sidewalk: route(['HCD-Snow and Ice on Sidewalks']),
  scooter_or_ebike_issue: route(['TRM-LIME Scooter & E-Bike Complaint', 'TRM-SPIN Scooter & E-Bike Complaint'], 'manual_review'),
  bench_damage: route(['TRM-Bench Concern']),
  abandoned_vehicle: route(['TRS-48 Hour Parking/Abandoned Vehicle', 'HCD-Abandoned Vehicle']),
  parking_violation: route(['TRS-Parking Complaint']),
  parking_meter_issue: route(['PABC-Pay by License Plate Meter Complaints', 'PABC-Single Space Meter Complaints'], 'manual_review'),
  accessibility_obstruction: route(['TRS-Parking Complaint', 'TRM-(ADA) Sidewalk Ramp Concern (Repair)'], 'manual_review'),
  roads_and_sidewalks_unspecified: route(['TEC-Street Repair (Misc)'], 'manual_review'),

  traffic_signal_damage: route(['TRT-Traffic Signal Repairs']),
  traffic_signal_timing: route(['TRT-Signal Timing']),
  traffic_sign_damage: route(['TRT-Sign Damaged/Sign Structure']),
  missing_traffic_sign: route(['TRT-Traffic Sign Request', 'TRT-New Traffic Sign'], 'manual_review'),
  street_marking_damage: route(['TRT-Street and Crosswalk Markings']),
  crosswalk_damage: route(['TRT-Crosswalks', 'TRT-Street and Crosswalk Markings']),
  flex_post_damage: route(['TRT-Flex posts']),
  streetlight_outage: route(['TRM-Street Light Out', 'BGE-StLight(s) Out', 'BGE-StLight(s) Out Rear'], 'manual_review'),
  streetlight_damage: route(['TRM-StLight Damaged/Knocked Down/Rusted']),
  streetlight_cover_missing: route(['TRM-StLight Pole Access Cover/Plate Missing']),
  streetlight_missing: route(['TRM-StLight Pole Missing']),
  streetlight_brightness: route(['TRM-StLighting Inadequate/Too Bright']),
  traffic_signals_and_streetlights_unspecified: route(['TRT-Traffic Signal Repairs'], 'manual_review'),

  illegal_dumping: route(['HCD-Illegal Dumping']),
  overflowing_trash: route(['HCD-Sanitation Property', 'SW-Mixed Refuse'], 'manual_review'),
  abandoned_bulk_waste: route(['SW-Bulk Scheduled-Weekday', 'SW-Bulk Scheduled-Saturday', 'SW-Bulk Special'], 'manual_review'),
  appliance_disposal: route(['SW-Appliance (White Goods)', 'SW-Appliance (White Goods) Special'], 'manual_review'),
  dirty_alley: route(['SW-Dirty Alley']),
  dirty_street: route(['SW-Dirty Street']),
  missed_trash_or_recycling: route(['SW-Bag Pickup', 'SW-Recycling'], 'manual_review'),
  trash_or_recycling_container_issue: route(['SW-City Trash Can or Recycling Cart Concern', 'SW-City Trash Can or Recycling Cart Lost or Stolen'], 'manual_review'),
  public_trash_can_issue: route(['SW-Public (Corner) Trash Can Issue', 'SW-Park Cans'], 'manual_review'),
  dumpster_issue: route(['SW-Dumpster Collection'], 'manual_review'),
  leaf_debris: route(['SW-Leaf Removal']),
  fire_debris: route(['SW-Fire Debris Removal']),
  graffiti: route(['HCD-Graffiti', 'SW-Graffiti Removal', 'RP-Graffiti Removal'], 'manual_review'),
  syringe_or_sharps: route(['HLTH-Syringe Disposal Request']),
  waterway_trash: route(['SW-Water Way Cleaning']),
  dead_animal: route(['HLTH-Animal Dead Animal Pickup-Wildlife or Stray']),
  trash_and_sanitation_unspecified: route(['HCD-Sanitation Property'], 'manual_review'),

  street_flooding: route(['WW-Storm Flooded Street']),
  standing_water: route(['HLTH-EV Stagnant Water', 'WW-Storm Misc Investigation'], 'manual_review'),
  water_main_leak: route(['WW-Water Leak (Exterior)']),
  water_meter_leak: route(['WW-Water Meter Leak']),
  water_meter_cover_damage: route(['WW-Water Meter Cover Missing or Damaged']),
  hydrant_damage: route(['WW-Hydrant Damaged']),
  hydrant_leak: route(['WW-Hydrant Leaking']),
  open_hydrant: route(['WW-Hydrant Open']),
  sewer_overflow: route(['WW-Sewer Overflow']),
  basement_sewage: route(['WW-Sewer Water In Basement', 'HCD-Emergency Sewer Investigation'], 'manual_review'),
  blocked_storm_drain: route(['WW-Storm Inlet Choke']),
  damaged_storm_inlet: route(['WW-Storm Damaged Inlet']),
  erosion_or_sediment: route(['WW-Sediment or Erosion Problem']),
  waterway_pollution: route(['WW-Waterway Pollution Investigation']),
  discolored_water: route(['WW-Water Discolored']),
  water_surface_repair: route(['WW-Surface Repair']),
  water_drainage_and_sewage_unspecified: route(['WW-Storm Misc Investigation', 'WW-Sewer Misc Investigation'], 'manual_review'),

  fallen_tree_or_branch: route(['FOR-Down Tree', 'FOR-Fallen Limb'], 'manual_review'),
  broken_branch_in_tree: route(['FOR-Broken Branch in Tree']),
  damaged_tree: route(['FOR-Tree Maintenance']),
  tree_maintenance: route(['FOR-Tree Maintenance']),
  park_damage: route(['RP-Park Maintenance']),
  playground_damage: route(['RP-Playgrounds']),
  ball_field_damage: route(['RP-Ball Field']),
  park_building_damage: route(['RP-Building Maintenance']),
  overgrown_public_grass: route(['RP-Grass Cutting', 'TRM-Grass Mowing'], 'manual_review'),
  trees_and_public_spaces_unspecified: route(['RP-Park Maintenance'], 'manual_review'),

  unsafe_building: route(['HCD-Maintenance Structure', 'HCD-CCE Building Inspections'], 'manual_review'),
  building_maintenance_violation: route(['HCD-Maintenance Structure']),
  construction_hazard: route(['HCD-CCE Building Permit Complaint']),
  building_permit_violation: route(['HCD-CCE Building Permit Complaint']),
  demolition_hazard: route(['HCD-CCE Demolition']),
  vacant_property_hazard: route(['HCD-Vacant Building']),
  zoning_violation: route(['HCD-Zoning Investigation']),
  illegal_sign_or_flyer: route(['HCD-Illegal Campaign Signs on Private Property', 'HCD-Illegal Flyers', 'HCD-Illegal Signs on Public Property'], 'manual_review'),
  fire_code_violation: route(['FIR-Fire Code Violation', 'HCD-Fire Protection'], 'manual_review'),
  property_pest_infestation: route(['HCD-Bed Bugs', 'HCD-Insects', 'HCD-Rodents'], 'manual_review'),
  property_sanitation: route(['HCD-Sanitation Property']),
  buildings_and_construction_unspecified: route(['HCD-CCE Building Inspections'], 'manual_review'),

  downed_power_line: route([], 'emergency'),
  exposed_wiring: route(['BGE-C-Order Damage'], 'manual_review'),
  damaged_utility_equipment: route(['BGE-C-Order Damage', 'BGE-Conduit Observation'], 'manual_review'),
  debris_on_wire_or_pole: route(['TRM-Debris Hanging From Wires or Poles']),
  conduit_damage: route(['TRC-Conduit Investigation', 'BGE-Conduit Observation'], 'manual_review'),
  electricity_and_gas_unspecified: route([], 'manual_review'),

  injured_or_abused_animal: route(['HLTH-Animal In Danger/Injured/Abused/Neglected']),
  loose_or_aggressive_animal: route(['HLTH-Animal Aggressive Animal', 'HLTH-Animal Failure to Restrain Animal, Known Owner/Known Address'], 'manual_review'),
  animal_attack: route([], 'emergency'),
  stray_animal_held: route(['HLTH-Animal Stray Held']),
  trapped_animal: route(['HLTH-Animal Domestic Animal Trap or Capture Request', 'HLTH-Animal Trapped In Vacant Building'], 'manual_review'),
  animal_unsanitary_conditions: route(['HLTH-Animal Unsanitary Conditions']),
  wildlife_complaint: route(['HLTH-Animal Wildlife Complaint']),
  animals_unspecified: route(['HCD-Animals'], 'manual_review'),

  structure_fire: route([], 'emergency'),
  vehicle_fire: route([], 'emergency'),
  garbage_fire: route([], 'emergency'),
  brush_fire: route([], 'emergency'),
  smoke_unknown_source: route([], 'emergency'),
  visible_injury: route([], 'emergency'),
  immediate_threat_other: route([], 'emergency'),
  fire_injury_or_immediate_threat_unspecified: route([], 'emergency'),

  noise_complaint: route(['HLTH-EV Noise']),
  odor_complaint: route(['HLTH-EV Odor']),
  dust_complaint: route(['HLTH-EV Dust']),
  pesticide_concern: route(['HLTH-EV Pesticide']),
  smoking_or_tobacco_violation: route(['HLTH-EV Smoking Ban Violation', 'HLTH-Tobacco Enforcement Request'], 'manual_review'),
  public_pool_or_spa_concern: route(['HLTH-EV Public Swimming Pool/Spa Complaint']),
  food_facility_concern: route(['HLTH-Food Facility Complaint']),
  waste_hauler_concern: route(['HLTH-EV Waste Hauler']),
  liquor_license_concern: route(['BCLB-Liquor License Complaint']),
  other_hazard: route(['ECC-Citizen Complaint or Concern'], 'manual_review'),
  no_visible_hazard: route([], 'no_submission'),
  unable_to_assess: route([], 'manual_review'),
});

export function baltimoreRouteForIncidentType(incidentType) {
  return BALTIMORE_311_ROUTES[incidentType];
}

export function assertCompleteBaltimoreRouting() {
  const missing = INCIDENT_TYPES.filter(type => !BALTIMORE_311_ROUTES[type]);
  const extra = Object.keys(BALTIMORE_311_ROUTES).filter(type => !INCIDENT_TYPES.includes(type));
  if (missing.length || extra.length) {
    throw new Error(`Baltimore routing mismatch: missing=${missing.join(',')} extra=${extra.join(',')}`);
  }
  return true;
}
