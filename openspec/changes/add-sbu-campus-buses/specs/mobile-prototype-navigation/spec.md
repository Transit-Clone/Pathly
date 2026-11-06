# Spec Delta

## ADDED Requirements

### Requirement: Stony Brook University campus buses are covered
In addition to the existing agencies, the app SHALL cover Stony Brook University's campus bus routes (shown as "SBU Transit") from the schedule data SBU publishes through its real-time vendor. Their routes SHALL appear in Nearby, open route detail and departures pages, and take part in every feature built on the app's timetables (such as stop search), in the same way as the existing agencies. Routes that have no scheduled trips in the published data SHALL NOT be listed.

SBU's routes run as loops published in a single direction. Route detail and departures SHALL name such a route by its own name (for example "Outer Loop"), never by a generic headsign such as "Outbound", and SHALL NOT offer a second direction that has no trips.

A campus route whose published short name matches another agency's name (SBU's Railroad shuttle is published as "LIRR") SHALL be shown as an SBU bus, with the bus badge shape and "SBU Transit" as its agency, and SHALL NOT be returned when the rider searches for the Long Island Rail Road.

Until live data for SBU is enabled, campus departures SHALL be scheduled times marked as untracked. When it is enabled, live predictions and vehicle positions SHALL come from SBU's published real-time feed, and the routes SHALL fall back to scheduled, untracked times whenever that feed is unavailable, as the existing agencies do.

#### Scenario: Rider at the Stony Brook LIRR station
- **WHEN** the rider is at the Stony Brook LIRR station while campus buses are scheduled
- **THEN** Nearby lists the SBU routes serving that stop with their upcoming departures, alongside the LIRR, and each opens its route detail page

#### Scenario: Loop route without a second direction
- **WHEN** the rider opens the Outer Loop
- **THEN** the page is titled with the route's name, lists its departures from the selected stop, and offers no direction switch

#### Scenario: Searching for the railroad
- **WHEN** the rider searches for "LIRR"
- **THEN** Long Island Rail Road lines are returned and SBU's Railroad shuttle is not

#### Scenario: Campus bus before live data is enabled
- **WHEN** the rider opens an SBU route and live data for SBU is not enabled
- **THEN** its departures show scheduled times marked as untracked, and no technical error is shown

#### Scenario: Outside the service calendar
- **WHEN** the rider is on campus on a date with no SBU service in the published data (for example during a break)
- **THEN** no SBU route shows upcoming departures, and no other agency's results are affected

### Requirement: Transit data sources are credited
The app SHALL list the source of each agency's transit data in Help & About, with any attribution wording the source requires. An agency whose data is published without an explicit license SHALL NOT be shown to riders in a release build until written permission from the publisher is on record, and its credit SHALL follow any conditions of that permission. The app SHALL NOT show an agency's logo or other trademarks without the agency's permission.

#### Scenario: Rider reviews data sources
- **WHEN** the rider opens Help & About
- **THEN** a transit data section lists each covered agency's data source, including Stony Brook University's campus bus data, with its required attribution

#### Scenario: Permission not on record
- **WHEN** a release build is prepared and permission to use SBU's data is not on record
- **THEN** SBU routes are not shown to riders in that build
