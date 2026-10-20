# Spec Delta

## ADDED Requirements

### Requirement: Trip map shows the real path
The planned trip-detail map SHALL be a real map showing the trip's actual path as the routing service returned it:
- each transit leg as a line in its transit line's color;
- walking as a dotted, neutral line;
- a marker at the start, at each place the rider boards or gets off, and at the destination.

The map SHALL open framed to the whole trip. Route Results SHALL show the same kind of map for its first itinerary behind the results list, framed to the origin and destination. Like other trip-detail maps, it SHALL stay non-interactive under the scrolling content.

#### Scenario: Rider opens a planned trip
- **WHEN** the rider opens an itinerary that walks to the LIRR, rides to Jamaica, and transfers to the E train
- **THEN** the map shows a dotted walk to the station, the LIRR leg in the LIRR line's color, the E train leg in the E's color, and markers at the start, the boarding, transfer, and alighting points, and the destination, all in view

#### Scenario: Results map follows the first itinerary
- **WHEN** Route Results finishes loading
- **THEN** the map behind the list shows the origin, the destination, and the first itinerary's path

## MODIFIED Requirements

### Requirement: Consistent trip-detail presentation
The planned trip-detail screen SHALL use the Pathly map-first presentation, route identity treatment, prominent fare and duration summary, obvious leave and arrive times, map actions, anchored trip action, and individually separated route-leg cards. When the fare is known, a note SHALL say it is the full adult one-way fare.

A planned trip SHALL list every step in order:
- **Walking steps:** walking duration, distance, and the place walked to.
- **Transit legs:** a card with the line's identity, the operating agency, the headsign, the boarding stop and time, the number of stops, and the alighting stop and time.
- **Transfers:** a transfer row between consecutive transit legs, showing the walk (if any) and the wait until the next departure.

Each agency name SHALL link to the agency's website when the routing service provides one. Planned trips SHALL NOT show a service-alert status, because no real alert data backs it.

#### Scenario: Rider compares planned and recent details
- **WHEN** a rider opens a planned trip, now that the sample recent trips are removed
- **THEN** it uses the shared trip-detail hierarchy and controls, and no separate recent-trip detail screen exists until real trips are recorded

#### Scenario: Rider checks what the fare covers
- **WHEN** a rider opens a planned trip with a known fare
- **THEN** below the leave and arrive times, a note says the shown amount is the full adult one-way fare

#### Scenario: Rider reviews transfers
- **WHEN** a trip contains more than one transit leg
- **THEN** every leg is displayed in a distinct card with its own route identity, agency, headsign, boarding and alighting stops and times, stop count, and duration, and a transfer row between legs shows the walk and the wait for the next departure

#### Scenario: Rider reviews walking
- **WHEN** a planned trip starts with a walk to the first stop
- **THEN** the first step reads as a walk with its duration, distance, and destination stop, before the first transit leg card

#### Scenario: Planned trip shows no invented alerts
- **WHEN** a rider opens a planned trip
- **THEN** no "Service alerts · No delays" status is shown

### Requirement: Mode-aware route badge
Every route identity marker outside the nearby-transit cards SHALL use one shared badge whose shape identifies the mode: a circle for subway lines, a rounded square for bus routes, and a rectangular tag for commuter rail. The badge SHALL use the route identity color and white text, and SHALL come in a consistent small, medium, and large size scale. The agency used to choose the shape SHALL come from route data, never be inferred from the route's short name.

The badge text SHALL be the route's short name when it is a single word of up to seven characters (`E`, `51`, `SIM3C`, `BxM10`, `Q44-SBS`). Only longer or multi-word names SHALL be abbreviated (LIRR branch codes, or initials), so a badge never names a different route.

#### Scenario: Rider distinguishes modes in a multi-leg trip
- **WHEN** a planned trip or route result contains legs on different modes
- **THEN** each leg's badge shape reflects its mode, and badges of the same size share identical height

#### Scenario: Express bus keeps its full route code
- **WHEN** an itinerary rides the SIM3C express bus
- **THEN** its badge reads "SIM3C", not "S"

#### Scenario: Badge is announced meaningfully
- **WHEN** a screen reader focuses a route badge
- **THEN** it announces the route's short name and mode (for example, "E train" or "S1 bus")

## REMOVED Requirements

### Requirement: Recent trip card presentation
**Reason**: The Recents tab's cards showed hard-coded sample trips that the rider never took. They are removed, and Recents shows an empty state until real trips are recorded.
**Migration**: None for riders. Saving real trips to Recents is planned as a later change, which will define its own card presentation.
