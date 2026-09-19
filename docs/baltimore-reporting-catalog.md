# Baltimore civic reporting catalog

This catalog is the starting point for Baltimore City routing in One Minute Utopia. It maps what a resident can observe to the agency or service that normally owns the next action. It is designed for triage, links, and a human-confirmed handoff; it is not a substitute for emergency dispatch, an official inspection, a police investigation, medical advice, or legal advice.

## Safety rules for the app

- **Immediate danger, active fire, smoke, explosion, person in danger, serious injury, violence in progress, gas odor, downed energized wire, or a live traffic hazard:** tell the resident to call **911**. Do not wait for image analysis or submit an automated form.
- **Urgent but not life-threatening:** show the owner and the Baltimore 311 option, with a phone call preferred when delay could increase harm.
- **Routine city service:** route to **Baltimore 311**. The 311 system is the citywide intake and work-order system for non-emergency service requests; it can be reached by dialing 311 inside the city or through the [Baltimore 311 portal](https://balt311.baltimorecity.gov/).
- **Crime:** use BPD’s reporting rules. Online or telephone reporting is for eligible non-emergency incidents; known suspects, witnesses, recent/in-progress incidents, injuries, threats, hate/bias crimes, and evidence needs require the appropriate police response. See [BPD file a police report](https://www.baltimorepolice.org/file-police-report).
- **Health, housing, or personal-services reports may contain sensitive information.** The app should minimize names, medical details, faces, license plates, and interior-home imagery. Never send a photo or form automatically without the user seeing and confirming the destination and payload.
- **Do not infer the owner only from an image.** Ask for location, public/private ownership, whether the condition is active, and whether anyone is at risk. If ownership is uncertain, route to 311 for triage.
- **The app should keep its own report and the government case number separate.** A link opened or a form submitted is not proof that a city agency accepted or resolved the issue.

## Primary city intake

### Baltimore 311 / Mayor’s Office of Constituent Services

**Use for:** potholes, sidewalks, street conditions, traffic signs and signals, streetlights, missed trash or recycling, illegal dumping, graffiti, dead animals, fallen trees, drainage and flooding complaints, abandoned vehicles, parking and many other non-emergency city services.

**Handoff:** [Baltimore 311 portal](https://balt311.baltimorecity.gov/) · dial **311** within Baltimore City or **410-396-5352** from outside the city.

**App behavior:** 311 should be the fallback destination when more specific ownership is uncertain. Preserve the city’s service-request link and any returned CSR number.

## City departments and offices

### Baltimore City Fire Department (BCFD)

**Emergency:** active fire, smoke, explosion, rescue, hazardous-material release, carbon-monoxide symptoms, serious injury, or a person needing emergency medical care → **911**.

**Routine or prevention-related issues:** blocked fire exits, unsafe fire lanes, missing or damaged fire extinguishers in a public/commercial setting, fire-code concerns, smoke-alarm education, repeated false alarms, fireworks complaints, or a suspected hazardous-material condition that is not actively threatening people. Start with [Baltimore 311](https://balt311.baltimorecity.gov/) or the [Baltimore City Fire Department](https://fire.baltimorecity.gov/) for the current non-emergency contact and inspection route.

**Image categories:** `fire_injury_or_immediate_threat`, `electricity_and_gas`, `buildings_and_construction`.

**Never automate:** dispatch, evacuation instructions, medical triage, or a fire investigation submission.

### Baltimore Police Department (BPD)

**Emergency:** crime in progress, immediate threat, violence, weapon, injury, dangerous driver, or suspicious activity requiring immediate response → **911**.

**Eligible non-emergency examples:** vandalism or destruction of property, larceny, larceny from auto, lost or stolen property, eligible hit-and-run, abandoned vehicle, nuisance complaint, and some civil matters. Use [BPD’s file-a-police-report page](https://www.baltimorepolice.org/file-police-report) and follow its eligibility rules. BPD lists **410-637-8875** for its Telephone Reporting Unit during its stated hours; BPD’s public pages also identify 311 for non-emergency contact.

**Other routes:** [BPD Public Integrity complaint portal](https://complaintsportal.baltimorepolice.org/) for officer misconduct or compliments; [Metro Crime Stoppers](https://www.baltimorepolice.org/) for anonymous tips when appropriate.

**Image categories:** `other_hazard`, `fire_injury_or_immediate_threat`, `traffic_signals_and_streetlights`, `animals` when an animal is actively dangerous.

**Never automate:** accusations naming a person, hate/bias reports, reports with known suspects or witnesses, active incidents, injury cases, or any emergency.

### Baltimore City Department of Public Works (DPW)

**Solid waste and sanitation:** illegal dumping, overflowing public trash, missed trash or recycling, bulk-trash issues, litter, waste in an alley, dead animal on a public right-of-way, street sweeping, and sanitation conditions → [DPW](https://publicworks.baltimorecity.gov/) or [Baltimore 311](https://balt311.baltimorecity.gov/).

**Water and wastewater:** water-main break, leaking hydrant, low water pressure, sewer backup, manhole problem, sewage discharge, storm-drain obstruction, standing water, flooding, and suspected water contamination → DPW/311. A main break, sewage release, or flooding that threatens life or property should be called in immediately; use **911** if there is immediate danger.

**Environmental programs:** sanitary discharges and pollution affecting city waterways may require DPW and/or Maryland Department of the Environment; route uncertain cases to 311 with the water body, direction of flow, date/time, and photos.

**Image categories:** `trash_and_sanitation`, `water_drainage_and_sewage`, `roads_and_sidewalks`.

**Useful contacts from city materials:** DPW administrative **410-396-3310**, solid waste **410-396-5134**, water and wastewater **410-396-3500**. Confirm numbers on the current DPW site before displaying them as authoritative.

### Baltimore City Department of Transportation (BCDOT)

**Use for:** potholes, damaged or missing signs, traffic-signal malfunction, streetlight outage, unsafe crosswalk, damaged curb or sidewalk in the public right-of-way, roadway debris, guardrail or bridge condition, lane-marking problem, bike-lane obstruction, traffic-calming request, and accessibility problems in the transportation right-of-way → [BCDOT](https://transportation.baltimorecity.gov/) or [Baltimore 311](https://balt311.baltimorecity.gov/).

**Emergency:** a signal failure, fallen object, sinkhole, collision obstruction, or roadway condition creating immediate danger → **911** first, then 311/transportation follow-up.

**Image categories:** `roads_and_sidewalks`, `traffic_signals_and_streetlights`, `trees_and_public_spaces`.

**Important boundary:** a Maryland-numbered state route, interstate, or state-owned bridge may belong to [Maryland State Highway Administration](https://www.roads.maryland.gov/), not BCDOT. The app should ask whether the road is a state highway when known and otherwise use 311.

### Baltimore City Department of Housing and Community Development (DHCD) / Code Enforcement

**Use for:** unsafe or vacant buildings, dangerous structural conditions, exterior housing-code violations, no heat, lack of water, severe leaks, vermin or trash conditions tied to a property, illegal occupancy, construction without permits, blocked egress in a dwelling, property-maintenance violations, and suspected code violations → [Baltimore Housing](https://dhcd.baltimorecity.gov/) and [Baltimore 311](https://balt311.baltimorecity.gov/).

**Emergency:** collapse risk, exposed live wiring, gas leak, fire, or immediate threat to occupants → **911**. A tenant should not enter an unsafe structure to obtain a photograph.

**Image categories:** `buildings_and_construction`, `electricity_and_gas`, `water_drainage_and_sewage`, `animals`, `trash_and_sanitation`.

**App fields:** occupied/vacant, interior/exterior, rental/public housing/private property, visible address, access blocked, and whether children or vulnerable residents are exposed.

### Housing Authority of Baltimore City (HABC)

**Use for:** maintenance, safety, accessibility, heating, water, mold, pests, elevators, common-area lighting, and other conditions in HABC-owned or managed public housing → [HABC](https://www.habc.org/). If the resident does not know whether the property is HABC-owned, route to 311 or Baltimore Housing and ask for the property name/address.

**Emergency:** call 911 for immediate danger; use the housing authority’s emergency maintenance route for urgent building failures.

**Image categories:** `buildings_and_construction`, `water_drainage_and_sewage`, `electricity_and_gas`, `traffic_signals_and_streetlights` for property lighting, `animals` for pest/animal conditions.

### Baltimore City Health Department (BCHD)

**Environmental health and public complaints:** rodents, cockroaches, unsafe food handling, restaurant or grocery sanitation, sewage or human-waste exposure, illegal dumping with public-health impact, mold or lead concerns, tattoo/body-art facility concerns, pool or spa sanitation, daycare or group-home sanitation, dead animals or animal-bite follow-up, and other environmental-health complaints → [Baltimore City Health Department](https://health.baltimorecity.gov/) and its environmental-health information.

**Food facilities:** use the Health Department’s current food-protection complaint route; do not present an image as proof of contamination. Include establishment name, address, observed condition, date/time, and whether anyone became ill.

**Lead and housing health:** BCHD can be relevant to lead-risk and environmental-health concerns, while DHCD/code enforcement owns many physical-property violations. The app may show both destinations with a short explanation.

**Communicable disease:** suspected reportable diseases are generally reported by health-care providers through state/local health channels, not by an anonymous photo app. Direct personal medical emergencies to a clinician or **911**; public health questions can use BCHD.

**Image categories:** `trash_and_sanitation`, `water_drainage_and_sewage`, `animals`, `buildings_and_construction`, `other_hazard`.

### Baltimore City Recreation and Parks

**Use for:** damaged playground equipment, unsafe athletic fields, park lighting, fallen limbs or trees in parks, trail hazards, dangerous glass or debris, damaged benches or facilities, illegal dumping in parks, and accessibility barriers in parks → [Baltimore City Recreation and Parks](https://bcrp.baltimorecity.gov/) or 311.

**Emergency:** active injury, fire, violence, or a tree/structure creating immediate danger → **911**.

**Image categories:** `trees_and_public_spaces`, `roads_and_sidewalks`, `trash_and_sanitation`, `traffic_signals_and_streetlights`.

### Baltimore City Department of Planning / CHAP

**Use for:** zoning or land-use concern, construction that appears inconsistent with a permit, historic-property alteration, demolition concern, public-space planning issue, and neighborhood development question → [Baltimore City Planning](https://planning.baltimorecity.gov/) and [CHAP](https://chap.baltimorecity.gov/) where historic preservation is involved.

**Important boundary:** Planning is generally not the emergency repair agency. For immediate structural danger or a suspected code violation, route to 911 or DHCD/311 first.

**Image categories:** `buildings_and_construction`, `trees_and_public_spaces`, `roads_and_sidewalks`.

### Baltimore City Office of Emergency Management (OEM)

**Use for:** citywide preparedness, disaster information, evacuation/shelter information, extreme heat/cold coordination, flooding or severe-weather information, and recovery resources. OEM coordinates city agencies; it is not a replacement for 911 or a routine repair ticket. See [Baltimore OEM](https://emergency.baltimorecity.gov/).

**Image categories:** `fire_injury_or_immediate_threat`, `water_drainage_and_sewage`, `buildings_and_construction`, `other_hazard`.

### Mayor’s Office of Homeless Services / Department of Human Services

**Use for:** homelessness outreach, shelter access, unsheltered residents needing services, extreme-weather outreach, and requests for supportive services. Do not treat the presence of an unhoused person as a code violation or police matter. Start with [Baltimore City homelessness services](https://homeless.baltimorecity.gov/) and the city’s current 311/211 guidance.

**Emergency:** medical crisis or immediate danger → **911**; behavioral-health crisis → **988** when appropriate and safe.

**Privacy:** do not publish identifiable photos of people experiencing homelessness. Prefer a location and service need without a face.

### Baltimore City Office of Equity and Civil Rights / Civil Rights and Wage Enforcement

**Use for:** discrimination in public accommodations or city services, civil-rights complaints, accessibility/disability discrimination, and certain wage-theft or employment-rights complaints → [Office of Equity and Civil Rights](https://civilrightsequity.baltimorecity.gov/).

**Image categories:** `other_hazard` and accessibility-related `roads_and_sidewalks` only when the report is about access, not ordinary maintenance.

**Privacy:** these reports often require a secure complaint process and personal information. The app should provide a link and not auto-submit from an image.

### Baltimore City Department of Consumer Protection and Business Licensing

**Use for:** suspected unlicensed businesses, deceptive or unfair business practices, commercial parking or towing licensing issues, street-vendor or transient-merchant licensing concerns, and other city-regulated business practices. The department was established by Ordinance 25-013 and its coverage is broader than ordinary neighborhood maintenance. See the [Baltimore City Code consumer-protection provisions](https://codes.baltimorecity.gov/us/md/cities/baltimore/code/1/index.full.html) and confirm the department’s current complaint intake before showing a direct form.

**Image categories:** `other_hazard`, `buildings_and_construction`, `roads_and_sidewalks` when the issue is a licensed street or commercial activity.

**Boundary:** unsafe food belongs with BCHD; an active crime or threat belongs with BPD/911; a normal public-space repair belongs with 311.

### Baltimore Animal Care and Control / animal-control services

**Use for:** stray or confined domestic animals, animal cruelty or neglect, aggressive animals, injured domestic animals, bite follow-up, dead animals, and animal nuisances. Start with the city’s current 311 or animal-control intake; the [Baltimore City animal-control code](https://codes.baltimorecity.gov/us/md/cities/baltimore/code/health/10/index.full.html) defines the public-health and nuisance responsibilities.

**Emergency:** an active attack or immediate threat → **911**. A bite may require both emergency medical care and BCHD/public-health follow-up. Wildlife concerns may belong to Maryland DNR instead.

**Privacy:** do not publish a person’s face, home address, or identifying information in cruelty reports. Keep the image private until the user confirms the destination.

### Baltimore City Office of the Inspector General

**Use for:** suspected fraud, waste, abuse, serious misconduct, or corruption involving city government. This is not the destination for ordinary potholes, neighborhood litter, or routine service delays. See [Baltimore OIG](https://oig.baltimorecity.gov/).

### Baltimore City Department of General Services

**Use for:** a condition on a city-owned building or facility when the responsible facility is known and it is not an emergency. Most residents should begin with 311, which can route the work order. See [DGS](https://dgs.baltimorecity.gov/).

### Baltimore City Public Schools

**Use for:** hazards on a school campus, unsafe playground equipment, building conditions, water or air concerns, blocked exits, or accessibility problems at a Baltimore City public school. Use the school system’s current [Baltimore City Public Schools contact page](https://www.baltimorecityschools.org/) and 911 for immediate danger. School-specific complaints may require the principal, facilities office, or school system rather than a city department.

### Parking Authority of Baltimore City

**Use for:** parking meters, city parking facilities, residential parking permits, parking-management questions, and some parking enforcement matters → [Parking Authority of Baltimore City](https://parking.baltimorecity.gov/). Routine blocked driveway, abandoned-vehicle, and public-right-of-way issues may instead route through BPD or 311 depending on the exact condition.

## State, regional, utility, and federal owners

### Maryland State Highway Administration (SHA)

**Use for:** hazards on interstates and state-maintained numbered highways, state bridges, signs, signals, roadway debris, and highway drainage → [Maryland 511](https://chart.maryland.gov/) for travel hazards and [SHA](https://www.roads.maryland.gov/). Emergency danger still goes to 911.

### Maryland Transit Administration (MTA)

**Use for:** buses, light rail, Metro SubwayLink, MARC-related Maryland transit facilities, transit shelters, operator conduct, accessibility, and station hazards → [MTA customer information](https://www.mta.maryland.gov/). Active danger or injury → 911.

### Maryland Department of the Environment (MDE)

**Use for:** pollution, sewage discharge, hazardous waste, air-quality or water-quality concerns, environmental violations, and conditions outside a city maintenance responsibility → [MDE environmental complaints](https://mde.maryland.gov/). City DPW or BCHD may also be involved; route uncertain local conditions to 311 first.

### Maryland Department of Natural Resources (DNR)

**Use for:** wildlife conflicts, injured wildlife, state natural resources, waterways, and some nuisance-wildlife issues. Domestic stray or dangerous animals generally belong to Baltimore Animal Care and Control; hunting/fishing/wildlife enforcement may require DNR police.

### Maryland Office of the State Fire Marshal

**Use for:** certain state fire-code, arson, explosives, fireworks, and fire-investigation matters outside the ordinary city fire/311 route. Start with BCFD/911 for active danger and confirm the current state route before displaying it.

### Baltimore Gas and Electric (BGE)

**Use for:** downed power lines, power outages, gas odor, damaged utility equipment, or suspected gas/electric infrastructure. Call BGE’s emergency number shown on its current [outage and safety page](https://www.bge.com/) and call **911** for immediate danger. Never approach or touch a downed line.

### Maryland Public Service Commission

**Use for:** regulated utility complaints, billing/service disputes, and utility consumer issues after contacting the provider → [Maryland PSC](https://www.psc.state.md.us/). This is not a dispatch channel for a live utility hazard.

### Baltimore City 911 / 988 / 211

**911:** immediate police, fire, rescue, or medical emergency.

**988:** behavioral-health crisis and suicide crisis support when there is no immediate physical danger; call 911 when there is an immediate threat to life or safety.

**211 Maryland:** health and human-service navigation, shelter, food, utilities, and social-service referrals → [211 Maryland](https://211md.org/).

## Routing taxonomy for the app

The existing image categories can map to a more Baltimore-specific second layer:

| App category | Baltimore subcategories | Default destination | Escalate when |
|---|---|---|---|
| Roads and sidewalks | pothole, sidewalk, curb ramp, debris, sinkhole, bridge, crosswalk | 311 / BCDOT | collision risk, collapse, injury → 911 |
| Traffic signals and streetlights | signal out, stuck signal, dark streetlight, sign missing, crosswalk signal | 311 / BCDOT | active traffic conflict or crash → 911 |
| Trash and sanitation | dumping, missed pickup, overflowing bin, litter, graffiti, dead animal | 311 / DPW | hazardous waste, active exposure, fire → 911/311 |
| Water, drainage, sewage | main break, sewer backup, blocked inlet, flooding, sewage discharge | 311 / DPW | flooding threatens people/property → 911 |
| Trees and public spaces | fallen tree, limb, park equipment, trail, field, park light | 311 / Recreation & Parks or BCDOT | live wire or immediate collapse → 911/BGE |
| Buildings and construction | vacant building, collapse risk, code violation, blocked exit, unpermitted work | DHCD / 311 | collapse, fire, exposed wiring → 911 |
| Electricity and gas | gas odor, downed wire, pole, outage, damaged utility equipment | BGE / 911 | always treat gas odor/downed energized wire as urgent |
| Animals | stray, aggressive, injured domestic animal, bite, wildlife | Baltimore Animal Care & Control / BCHD / DNR | attack or immediate danger → 911 |
| Fire, injury, immediate threat | fire, smoke, crash injury, violence, active hazard | 911 / BCFD / BPD | immediately; no automated submission |
| Other hazard | food, rodents, lead, pollution, transit, accessibility, public-health issue | ask clarifying questions; then 311/BCHD/MDE/MTA | immediate threat → 911 |

## Suggested routing record

Store routing as data, separate from the AI assessment:

```ts
type BaltimoreRoute = {
  id: string;
  displayName: string;
  jurisdiction: 'city' | 'state' | 'utility' | 'regional' | 'federal';
  issueTypes: string[];
  emergencyAction: '911' | '988' | '311' | 'provider' | 'none';
  intakeUrl?: string;
  phone?: string;
  requiresHumanConfirmation: true;
  lastVerified: string; // ISO date
  sourceUrl: string;
};
```

Every recommendation should carry `jurisdiction`, `owner`, `reason`, `urgency`, `intake_url`, `phone`, `last_verified`, and `requires_human_confirmation`. Keep URLs configurable so a changed city form does not require a code release.

## Implementation order

1. Ship the 311 fallback and emergency guardrails first.
2. Add the Baltimore subcategories above and ask the location/ownership questions needed to distinguish city, state, utility, and private property.
3. Link out to official forms with a review screen; record `opened`, `copied`, `user_confirmed`, and `submitted` separately.
4. Add city-specific links only after verifying them manually. Do not claim a submission succeeded unless the destination returns a case/reference number.
5. Add duplicate grouping using category, normalized subcategory, geospatial distance, and time window. Keep agency case numbers and the app’s internal cluster IDs distinct.

## Verification sources

- [Baltimore 311](https://balt311.baltimorecity.gov/)
- [Baltimore City agency directory and budget organization](https://bbmr.baltimorecity.gov/sites/default/files/upload/FY2026%20Agency%20Detail%20Volume%20II.pdf)
- [Baltimore Police: file a police report](https://www.baltimorepolice.org/file-police-report)
- [Baltimore City Department of Public Works](https://publicworks.baltimorecity.gov/)
- [Baltimore City Department of Transportation](https://transportation.baltimorecity.gov/)
- [Baltimore Housing / DHCD](https://dhcd.baltimorecity.gov/)
- [Baltimore City Health Department](https://health.baltimorecity.gov/)
- [Baltimore City Recreation and Parks](https://bcrp.baltimorecity.gov/)
- [Baltimore OEM](https://emergency.baltimorecity.gov/)
- [Baltimore City Office of Equity and Civil Rights](https://civilrightsequity.baltimorecity.gov/)
- [Baltimore City OIG](https://oig.baltimorecity.gov/)
- [Maryland SHA](https://www.roads.maryland.gov/)
- [Maryland Transit Administration](https://www.mta.maryland.gov/)
- [Maryland Department of the Environment](https://mde.maryland.gov/)
- [Maryland Public Service Commission](https://www.psc.state.md.us/)
- [211 Maryland](https://211md.org/)

**Maintenance note:** this is a routing and product-design catalog, not a promise that every URL, phone number, form, or department boundary remains unchanged. Re-verify links and contact details before a public launch and show the verification date in the app.
