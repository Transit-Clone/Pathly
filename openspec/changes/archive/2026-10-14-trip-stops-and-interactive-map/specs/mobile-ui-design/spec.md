# Spec Delta

## ADDED Requirements

### Requirement: Trip map stops are explorable
On the planned trip-detail map, tapping any stop marker (boarding, transfer, alighting, or a stop in between) SHALL show that stop's name and scheduled time in a small label next to the marker; tapping elsewhere on the map SHALL dismiss it. Tapping a stop row in the trip's expanded stop list SHALL center the map on that stop and show its label, without changing the page's scroll position.

#### Scenario: Rider taps a stop marker
- **WHEN** the rider taps the marker of a stop in between on the map
- **THEN** a label next to it shows the stop's name and scheduled time

#### Scenario: Rider finds a listed stop on the map
- **WHEN** the rider taps "Mineola · 9:14 AM" in a leg's expanded stop list
- **THEN** the map centers on Mineola and shows its label

## MODIFIED Requirements

### Requirement: Trip map shows the real path
The planned trip-detail map SHALL be a real map showing the trip's actual path as the routing service returned it:
- each transit leg as a line in its transit line's color;
- walking as a dotted, neutral line;
- a marker at the start, at each place the rider boards or gets off, and at the destination.
- a smaller marker, in the line's color, at each stop in between on a leg whose intermediate stops are known.

The map SHALL open framed to the whole trip. Route Results SHALL show the same kind of map for its first itinerary behind the results list, framed to the origin and destination. Both maps SHALL pan and zoom by gesture where content doesn't cover them (see "Stationary detail map backdrop"), and SHALL offer a control that frames the whole trip again once the rider has moved the map.

#### Scenario: Rider opens a planned trip
- **WHEN** the rider opens an itinerary that walks to the LIRR, rides to Jamaica, and transfers to the E train
- **THEN** the map shows a dotted walk to the station, the LIRR leg in the LIRR line's color, the E train leg in the E's color, and markers at the start, the boarding, transfer, and alighting points, and the destination, all in view

#### Scenario: Results map follows the first itinerary
- **WHEN** Route Results finishes loading
- **THEN** the map behind the list shows the origin, the destination, and the first itinerary's path

#### Scenario: Rider zooms into a transfer
- **WHEN** the rider pinches to zoom in on the transfer point of a planned trip's map
- **THEN** the map zooms there without the page scrolling, and the re-frame control returns it to the whole trip

### Requirement: Consistent trip-detail presentation
The planned trip-detail screen SHALL use the Pathly map-first presentation, route identity treatment, prominent fare and duration summary, obvious leave and arrive times, map actions, anchored trip action, and individually separated route-leg cards. When the fare is known, a note SHALL say it is the full adult one-way fare.

A planned trip SHALL list every step in order:
- **Walking steps:** walking duration, distance, and the place walked to.
- **Transit legs:** a card with the line's identity, the operating agency, the headsign, the boarding stop and time, the number of stops, and the alighting stop and time.
- **Stops in between:** when the leg's intermediate stops are known, its stop count SHALL be a control that expands, between the boarding and alighting rows, into every stop the leg passes, in order, each with its scheduled time. The list SHALL start collapsed and SHALL collapse again when the control is used a second time. When they aren't known, the stop count SHALL be plain text, with no empty list.
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

#### Scenario: Rider checks the stops in between
- **WHEN** the rider opens a trip with a 14-stop LIRR leg whose stops are known and taps "14 stops"
- **THEN** the leg card lists the stops between boarding and getting off, in travel order, each with its scheduled time, and tapping "14 stops" again hides them

#### Scenario: Stops aren't known for a leg
- **WHEN** a leg's intermediate stops couldn't be matched to a timetable
- **THEN** the card shows its stop count as plain text and offers no stop list

### Requirement: Stationary detail map backdrop
The route-detail and planned/recent trip-detail screens SHALL match the home screen: the map SHALL stay stationary behind the page, and the detail content SHALL scroll continuously over it in one native vertical scroll, without draggable bounds, snap states, or a resize handle. Downward scrolling SHALL cover progressively more of the map without moving the map image. On trip-detail screens, the back, favorite, and current-location controls SHALL stay fixed and reachable at every scroll position, over a bar that fades in once the content reaches the top, and the GO or END action SHALL remain available at every scroll position. On the route-detail screen, the back control and the vertical column of current-location, favorite, and pin controls SHALL sit on the map and scroll away with it, with no bar behind them, so the scrolled page shows only route content. When the route-detail screen shows a real (live) route map, or a planned trip-detail screen shows its trip map, the uncovered map area SHALL respond directly to gestures. Dragging there SHALL pan the map, pinching (or the scroll wheel or trackpad on web) SHALL zoom it, and dragging the detail content SHALL still scroll the page. Illustrated maps SHALL remain non-interactive.

#### Scenario: Map image does not move while scrolling
- **WHEN** a rider scrolls downward on a route-detail or trip-detail screen
- **THEN** the content rises over the map while the map's route lines, stops, and markers stay at the same screen position

#### Scenario: Rider restores the map
- **WHEN** the rider scrolls back to the top of the detail page
- **THEN** the full map window is visible again above the content

#### Scenario: Trip controls stay reachable
- **WHEN** the trip-detail content covers most of the map
- **THEN** the back, favorite, and current-location controls and the trip action stay visible and operable

#### Scenario: Route controls scroll away with the map
- **WHEN** the rider scrolls a route-detail page until the content covers the map
- **THEN** no header bar appears and the route controls have scrolled out of view with the map, returning when the rider scrolls back to the top

#### Scenario: Content is discoverable initially
- **WHEN** a route-detail or trip-detail screen first opens
- **THEN** the map and the top of the detail content are both visible

#### Scenario: Rider explores the live route map
- **WHEN** the rider drags or pinches on the uncovered area of a live route map or a planned trip map
- **THEN** the map pans or zooms and the page does not scroll

#### Scenario: Rider scrolls from the content
- **WHEN** the rider drags vertically on the route-detail content below a live route map
- **THEN** the page scrolls over the map as before and the map does not pan

#### Scenario: Map controls stay tappable
- **WHEN** the live route map or a planned trip map is interactive
- **THEN** the controls on the map (back, current-location, favorite, and pin on route detail; back, favorite, current-location, and the trip action on trip detail) still respond to taps
