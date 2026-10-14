# Spec Delta

## MODIFIED Requirements

### Requirement: Route Results supports editable trip criteria
Route Results SHALL display separate origin and destination fields that can be changed at any time. Each field SHALL be a control that, when activated, opens the destination search page for that endpoint. That page SHALL behave exactly like the original destination search: Google Places autocomplete limited to the service area, the same loading, empty, error, and unconfigured states, and session recent searches. When editing the origin, a "Current location" option SHALL appear first. Choosing a place SHALL set that endpoint and return to Route Results with the other endpoint and every other trip criterion unchanged; cancelling SHALL return to Route Results with nothing changed. The fields SHALL NOT accept typed text directly. The swap control SHALL exchange the two endpoints.

Route Results SHALL also display a leave-time control, a refresh control, a Modes control, and a Filter control. Filter SHALL offer selectable Fastest, Fewer transfers, and Lowest fare preferences. The leave-time control SHALL open a time picker offering Leave now, Depart at, and Arrive by, with scrollable hour, minute (5-minute increments), and AM/PM selections. After the rider confirms, the control SHALL display the chosen mode and time, and every itinerary SHALL show departure and arrival times consistent with that choice. The Modes control SHALL let the rider include or exclude Subway, Bus, and Rail, and SHALL hide itineraries that use an excluded mode. Refresh SHALL preserve the current trip criteria and update the local results presentation without contacting a remote routing service.

#### Scenario: Rider changes an endpoint
- **WHEN** the rider taps the destination field, types "stony", and picks Stony Brook University from the autocomplete suggestions
- **THEN** Route Results shows Stony Brook University as the destination, with the origin, leave time, modes, and filter unchanged

#### Scenario: Rider changes the origin back to their location
- **WHEN** the rider taps the origin field and chooses "Current location"
- **THEN** Route Results shows "Current location" as the origin

#### Scenario: Rider cancels editing an endpoint
- **WHEN** the rider taps an endpoint field and then cancels the search
- **THEN** Route Results returns with both endpoints and every trip criterion unchanged

#### Scenario: Rider changes route preference
- **WHEN** the rider selects Fastest, Fewer transfers, or Lowest fare from Filter
- **THEN** that preference is visibly selected and matching mock itineraries are ordered with recommended results first

#### Scenario: Rider picks a departure time
- **WHEN** the rider opens the leave-time control, chooses Depart at 10:30 AM, and confirms
- **THEN** the control reads "Depart 10:30 AM" and no itinerary departs before 10:30 AM, with each arrival equal to its departure plus its duration

#### Scenario: Rider picks an arrival deadline
- **WHEN** the rider chooses Arrive by 12:00 PM and confirms
- **THEN** the control reads "Arrive by 12:00 PM" and every itinerary arrives at or before 12:00 PM

#### Scenario: Rider cancels the picker
- **WHEN** the rider dismisses the time picker without confirming
- **THEN** the previous leave-time choice and itinerary times are unchanged

#### Scenario: Chosen time carries into trip details
- **WHEN** the rider opens an itinerary after choosing a time
- **THEN** the planned trip detail's leave and arrive times match that itinerary's card

#### Scenario: Rider filters by mode
- **WHEN** the rider excludes Rail in Modes
- **THEN** itineraries containing a rail leg are hidden, and if none remain an empty state with a reset action is shown

#### Scenario: Rider changes departure time or refreshes
- **WHEN** the rider confirms a new leave time or uses the refresh control
- **THEN** the screen provides visible local feedback while preserving the current origin, destination, time choice, mode filter, and preference

### Requirement: Nearby search adapts to density
Nearby discovery SHALL list every route that stops within its agency's base walking radius of the search point, however many there are, up to a safety limit of 40. The base radius is small where stops are dense (subway) and larger where they are sparse (suburban bus, LIRR). When fewer than six routes lie within the base radius, the search SHALL widen step by step, up to a maximum radius per agency, only until at least six routes are found. From the widened area it SHALL add only the closest additional routes needed to reach six, never every route in the wider area. Results SHALL stay ordered by distance.

#### Scenario: Suburban rider sees a useful list
- **WHEN** the rider is in a suburban area where only two routes lie within the base radius
- **THEN** the search widens and Nearby lists six routes, the two nearby ones plus the four closest from the wider area, ordered by distance

#### Scenario: Widening doesn't flood the list
- **WHEN** widening the search to reach six routes brings twenty more routes into range
- **THEN** only the four closest of them are added, not all twenty

#### Scenario: City rider sees everything close by
- **WHEN** the rider is in Midtown Manhattan, where twenty-five routes stop within the base radius
- **THEN** Nearby lists all twenty-five, ordered by distance, without widening the search
