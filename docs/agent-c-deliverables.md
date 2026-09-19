# Agent C Deliverables - Priority 2+3 Implementation

**Agent:** C (description + Baltimore routing)  
**Date:** 2026-09-19  
**PR:** [#12](https://github.com/gitpaperclip/oneminuteutopia/pull/12)  
**Branch:** `cursor/priority-2-3-description-routing-98e0`

## Executive Summary

Implemented three pure, deterministic modules for incident taxonomy, Baltimore routing, and description building. All modules are fully tested (106 tests passing), type-safe, and ready for Agent B's prepare-311 integration.

## Deliverables

### 1. `lib/incident-taxonomy.mjs`

Pure module mapping AI categories to Baltimore-specific subcategories and urgency levels.

**Exports:**
- `BALTIMORE_TAXONOMY` - Frozen object with all category mappings
- `getTaxonomy(category)` - Get taxonomy entry for a category
- `requiresEmergency(category, seriousness)` - Check if 911 required
- `requiresUrgent(category)` - Check if immediate action needed
- `getUrgency(seriousness)` - Map seriousness to urgency level
- `validateSubcategory(category, subcategory)` - Validate subcategory
- `getCategories()` - Get all valid categories

**Example:**
```javascript
import { getTaxonomy, getUrgency } from './lib/incident-taxonomy.mjs';

const taxonomy = getTaxonomy('roads_and_sidewalks');
// → { displayName: 'Roads and sidewalks', 
//     subcategories: ['pothole', 'sidewalk', ...],
//     defaultDestination: '311', ... }

const urgency = getUrgency(7);
// → 'urgent' (seriousness 5-8)
```

### 2. `lib/baltimore-311-routing.mjs`

Pure routing selector based on official Baltimore City catalog.

**Exports:**
- `DESTINATIONS` - Frozen object with all agency contact info
- `selectDestination({ category, seriousness, subcategory })` - Select destination
- `getDestination(destinationId)` - Get destination by ID
- `getAllDestinations()` - Get all destinations
- `formatRoutingDisplay(routing)` - Format for UI display

**Example:**
```javascript
import { selectDestination, formatRoutingDisplay } from './lib/baltimore-311-routing.mjs';

const routing = selectDestination({
  category: 'water_drainage_and_sewage',
  seriousness: 7,
  subcategory: 'sewer_backup',
});
// → { destination: DESTINATIONS['311'],
//     reason: 'Water, drainage, and sewage reports go to Baltimore 311',
//     urgency: 'urgent',
//     requiresImmediate: true,
//     alternates: [DESTINATIONS.DPW] }

const display = formatRoutingDisplay(routing);
// → { primary: { name: 'Baltimore 311', phone: '311', ... },
//     message: '...', urgency: 'urgent', callToAction: 'Contact ... immediately' }
```

**Routing Logic:**
- Fire/injury → 911 (always)
- Electricity/gas → BGE (with 911 escalation note)
- High seriousness (9-10) → 911 (any category)
- Food/rodents/health → BCHD
- Pollution → MDE
- Transit → MTA
- Default → 311 with agency alternates

### 3. `lib/description-builder.mjs`

Pure text generation for 311 reports.

**Exports:**
- `buildDescription(params)` - Build full structured description
- `buildTitle(params)` - Build short title
- `buildSummary(params)` - Build one-line summary
- `buildStructuredFields(params)` - Build Open311 fields
- `validateDescriptionInput(text)` - Validate and sanitize user input
- `buildEmergencyGuidance(category, seriousness)` - Build emergency text

**Example:**
```javascript
import { buildDescription, buildTitle, buildEmergencyGuidance } from './lib/description-builder.mjs';

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
// → Multi-line formatted description ready for 311 submission

const title = buildTitle({
  category: 'roads_and_sidewalks',
  subcategory: 'pothole',
  locationAddress: '123 Main St, Baltimore, MD',
});
// → "pothole - Roads and sidewalks at 123 Main St"

const guidance = buildEmergencyGuidance('fire_injury_or_immediate_threat', 8);
// → "EMERGENCY: Call 911 immediately. Do not wait..."
```

## Test Coverage

**106 tests passing** across three test files:

- `tests/incident-taxonomy.test.mjs` (30 tests)
  - Taxonomy structure and completeness
  - Emergency and urgency detection
  - Subcategory validation
  - Edge cases and immutability

- `tests/baltimore-routing.test.mjs` (38 tests)
  - Destination catalog completeness
  - Routing decision correctness
  - Subcategory routing refinements
  - Fallback chains and jurisdiction
  - Determinism verification

- `tests/description-builder.test.mjs` (38 tests)
  - Description generation
  - Title and summary formatting
  - Input validation and sanitization
  - Emergency guidance
  - Determinism verification

## Integration Guide for Agent B

To use these modules in prepare-311:

```javascript
// 1. Import modules
import { selectDestination } from './lib/baltimore-311-routing.mjs';
import { buildDescription, buildStructuredFields } from './lib/description-builder.mjs';
import { getTaxonomy } from './lib/incident-taxonomy.mjs';

// 2. Get routing recommendation
const routing = selectDestination({
  category: analysisResult.category,
  seriousness: analysisResult.seriousness,
  subcategory: userSelectedSubcategory, // optional
});

// 3. Check if emergency (block submission, show 911)
if (routing.requiresImmediate && routing.destination?.id === '911') {
  return { error: 'EMERGENCY_CALL_911', guidance: buildEmergencyGuidance(...) };
}

// 4. Build description
const description = buildDescription({
  category: analysisResult.category,
  seriousness: analysisResult.seriousness,
  aiConfidence: analysisResult.ai_confidence,
  subcategory: userSelectedSubcategory,
  userDescription: reportInput.user_description,
  locationAddress: reportInput.location_address,
  locationSource: reportInput.location_source,
  categoryWasCorrected: reportInput.category !== analysisResult.category,
});

// 5. Build structured fields (for Open311 API)
const fields = buildStructuredFields({
  category: reportInput.category,
  subcategory: userSelectedSubcategory,
  userDescription: reportInput.user_description,
  latitude: reportInput.latitude,
  longitude: reportInput.longitude,
  locationAddress: reportInput.location_address,
});

// 6. Return prepare-311 result
return {
  destination: routing.destination,
  description,
  structuredFields: fields,
  requiresHumanConfirmation: routing.destination.requiresHumanConfirmation,
};
```

## Catalog Compliance

All routing decisions are based on official sources:

- Primary: `docs/baltimore-reporting-catalog.md`
- Last verified: 2026-09-19
- Each destination includes `lastVerified` and `sourceUrl`
- Routing taxonomy table (line 210 of catalog) implemented exactly

**Verified destinations:**
- City: 911, 311, BCDOT, DPW, DHCD, BCHD, Recreation & Parks, Animal Control
- State: MTA, MDE, DNR
- Utility: BGE

## Design Constraints Met

✅ Backend only (no page.tsx, no global CSS)  
✅ No API routes or persistence changes  
✅ No Gemini calls  
✅ No Baltimore City website automation  
✅ No secrets exposed  
✅ Pure deterministic functions  
✅ Comprehensive tests  
✅ TypeScript definitions  
✅ All lint and typecheck pass  

## Next Steps

1. **Agent B** can now import these modules for prepare-311 implementation
2. Consider adding subcategory selection UI (Agent A/B coordination)
3. Future: Open311 API integration using `buildStructuredFields()`
4. Future: Add more state/utility destinations as needed

## Files Changed

```
lib/
  incident-taxonomy.mjs          (new, 195 lines)
  incident-taxonomy.d.ts         (new, 19 lines)
  baltimore-311-routing.mjs      (new, 287 lines)
  baltimore-311-routing.d.ts     (new, 57 lines)
  description-builder.mjs        (new, 239 lines)
  description-builder.d.ts       (new, 45 lines)

tests/
  incident-taxonomy.test.mjs     (new, 175 lines)
  baltimore-routing.test.mjs     (new, 337 lines)
  description-builder.test.mjs   (new, 418 lines)
```

**Total:** 9 new files, 1,753 lines added

## Questions for Agent B

1. Do you need additional fields in `buildStructuredFields()` for Open311 spec?
2. Should subcategory selection be required or optional in the UI?
3. Do you need a helper to compare routing destination with existing reports (duplicate detection)?
4. Should we add a `buildShareableLink()` for receipts with embedded routing info?

---

**Ready for review and merge.** All acceptance criteria met:
- ✅ Pure + tested helpers
- ✅ `npm run test:analysis` passes (106/106)
- ✅ Typecheck passes
- ✅ Lint passes for changed files
- ✅ PR opened: https://github.com/gitpaperclip/oneminuteutopia/pull/12
