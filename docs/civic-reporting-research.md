# Civic reporting research

This document records the research behind One Minute Utopia's problem statement.
It separates evidence from product assumptions so the project does not present
desk research as direct resident testing.

## Research question

What prevents a resident who notices a public problem from turning that
observation into a useful city service request, and what makes those requests
hard for agencies to organize?

Our working hypothesis is that three gaps matter:

1. Residents must determine where and how to report an issue before they can
   describe it.
2. Reporting participation and speed vary across neighborhoods, so 311 data do
   not represent every community equally.
3. Multiple residents can report the same physical incident as separate
   requests, leaving agencies to identify and reconcile duplicates.

## Evidence

### Finding the correct government entry point is a real access problem

The International City/County Management Association describes local service
access as being hampered by many phone numbers that residents find difficult to
understand and use, including uncertainty about which department owns a problem.
Its national 311 research examined centralized intake as a way to make local
government easier to reach.

This supports One Minute Utopia's decision to start with the resident's
observation and route from the issue, rather than expecting the resident to know
the agency or service category first.

### Reporting delays and underreporting are uneven

Liu, Bhandaram, and Garg analyzed more than 100,000 resident reports in New York
City and more than 900,000 in Chicago. They found substantial spatial and
socioeconomic differences in how quickly incidents were reported. Their study
also used the rate of duplicate reports as evidence that an incident had
occurred.

This does not prove that a faster interface alone eliminates reporting
inequality. It does show that delays and uneven participation affect the civic
data agencies receive, making reduced reporting friction a meaningful design
goal.

### Duplicate requests create operational work

A 2026 audit by the Chicago Office of Inspector General found that the city's
311 platform was intended to couple reports about the same issue, but sometimes
failed to identify duplicates. In those cases departments had to respond to or
manually reconcile requests separately, and different departments handled them
inconsistently.

One Minute Utopia therefore preserves each resident's evidence while grouping
nearby, recent reports with the same normalized incident type into one aggregate
incident. This is a prototype strategy, not a claim that Baltimore currently
handles duplicates in the same way as Chicago.

### Baltimore already supports mobile reporting, but classification remains work

Baltimore's official mobile reporting launch described more than 50 service
request types and emphasized attaching a photo and GPS location. The current
BALT311 app likewise routes resident-selected requests to the appropriate agency.
This is evidence that photo and location capture are useful, not evidence that
BALT311 is ineffective. One Minute Utopia explores the remaining layer: using a
photo to help prepare and normalize the category and description before the
resident reaches the official intake flow.

### Existing product walkthroughs exposed repeated manual work

The team reviewed BALT311, Snap311, and BOS:311 as comparable reporting
experiences. These products demonstrate that mobile civic reporting is useful
and feasible. Our walkthroughs also showed the remaining work a resident often
performs: selecting a service category, writing a description, supplying a
location, and deciding which reporting channel applies.

This competitive review is an observation about product flows, not a usability
study. It informed the prototype's photo-first workflow but does not establish
how often residents abandon existing forms.

## Product decisions supported by the research

- Begin with one photo and derive a reviewable category, incident type, and
  factual description.
- Keep the resident in control of corrections and final submission.
- Route to an official Baltimore, police, utility, or emergency destination
  without claiming that One Minute Utopia filed a government request.
- Normalize incident types so nearby reports can be compared consistently.
- Preserve independent evidence while grouping likely reports of the same
  incident into a super-report.
- Treat confidence and seriousness as decision support rather than verified
  facts or calibrated safety probabilities.

## Validation limits and next steps

Current validation consists of published research, official public material,
competitive product review, and internal workflow testing. The team has not run
a representative study of Baltimore residents or city employees. The next
validation step should include:

1. Task-based testing with Baltimore residents using both BALT311 and One Minute
   Utopia, measuring completion time, completion rate, category corrections, and
   confidence in where the report will go.
2. Accessibility testing with residents across different ages, languages,
   devices, and levels of technical familiarity.
3. Interviews with 311 and agency staff about required fields, duplicate
   handling, routing errors, and what makes photo evidence actionable.
4. A limited pilot measuring whether prepared reports are complete and whether
   the grouping rules merge the correct incidents without combining unrelated
   events.

## Sources

Sources were reviewed on September 20, 2026.

- Liu, Z., Bhandaram, U., and Garg, N. (2024), [Quantifying spatial
  under-reporting disparities in resident crowdsourcing](https://www.nature.com/articles/s43588-023-00572-6),
  *Nature Computational Science*, 4, 57-65.
- International City/County Management Association, [Using 311/CRM Technology
  to Improve Local Government Customer Service](https://icma.org/documents/using-311crm-technology-improve-local-government-customer-service).
- International City/County Management Association, [Call 311: Connecting
  Citizens to Local Government](https://icma.org/documents/call-311-connecting-citizens-local-government-final-report).
- Chicago Office of Inspector General (2026), [Audit of the 311 Service Request
  Process](https://igchicago.org/wp-content/uploads/2026/02/OIG-Audit-of-311-Service-Request-Process.pdf).
- Baltimore City, [Mobile 311](https://311.baltimorecity.gov/mobile-311) and
  [BALT311 citizen portal](https://balt311.baltimorecity.gov/citizen/s/).
- Baltimore City (2011), [launch of the Baltimore 311 mobile
  app](https://content.govdelivery.com/accounts/MDBALT/bulletins/116b0d), and the
  current [Baltimore City 311 App Store listing](https://apps.apple.com/us/app/baltimore-city-311/id1419786875).
- Comparable products reviewed: [Snap311](https://snap311.app/) and
  [BOS:311](https://www.boston.gov/departments/boston-311).
