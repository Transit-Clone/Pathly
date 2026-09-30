# Spec Delta

## MODIFIED Requirements

### Requirement: Route Results supports editable trip criteria
Route Results SHALL display separate origin and destination fields that can be changed locally at any time. It SHALL also display a leave-time control, a refresh control, a Modes control, and a Filter control. Filter SHALL offer selectable Fastest, Fewer transfers, and Lowest fare preferences. The leave-time control SHALL open a time picker offering Leave now, Depart at, and Arrive by, with scrollable hour, minute (5-minute increments), and AM/PM selections. After the rider confirms, the control SHALL display the chosen mode and time, and every itinerary SHALL show departure and arrival times consistent with that choice. The Modes control SHALL let the rider include or exclude Subway, Bus, and Rail, and SHALL hide itineraries that use an excluded mode. Refresh SHALL preserve the current trip criteria and update the local results presentation without contacting a remote routing service.

#### Scenario: Rider changes an endpoint
- **WHEN** the rider edits the origin or destination field
- **THEN** the field's visible value updates and remains associated with the displayed trip criteria

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

### Requirement: Route Results presents comparable itineraries
Route Results SHALL show several recommended-first itinerary cards. Each card SHALL show colored boxes for its ordered transit route segments on the left, total fare and total trip duration on the right, and the next departure or ride timing along a full-width bottom timeline. Cards SHALL NOT include Go or End buttons; selecting a card SHALL open its planned trip detail, where the rider starts or ends the trip.

#### Scenario: Rider compares trip options
- **WHEN** Route Results is visible
- **THEN** at least three mock itineraries can be compared by routes, transfers, fare, duration, and next-ride timing

#### Scenario: Rider starts a trip from results
- **WHEN** the rider wants to begin a listed itinerary
- **THEN** they open its card and use GO on the trip detail, because the result cards themselves have no Go or End buttons

## ADDED Requirements

### Requirement: Session favorites appear in the Favorites tab
Riders SHALL be able to favorite and unfavorite routes from route detail and trips from planned and recent trip detail. Every favorited item SHALL appear in the home Favorites tab, grouped into Routes and Trips, in the order it was saved. Selecting a favorite SHALL open its detail screen. Favorite state SHALL be consistent wherever the item is shown and SHALL last for the app session without any backend.

#### Scenario: Rider favorites a route
- **WHEN** the rider favorites a route on its detail screen and returns home to the Favorites tab
- **THEN** that route appears under Routes and opens its route detail when selected

#### Scenario: Rider favorites a trip
- **WHEN** the rider favorites a planned or recent trip and opens the Favorites tab
- **THEN** that trip appears under Trips with its route badges and destination, and opens its trip detail when selected

#### Scenario: Rider removes a favorite
- **WHEN** the rider unfavorites an item from its detail screen
- **THEN** it no longer appears in the Favorites tab, and the empty state returns when no favorites remain

#### Scenario: Favorite state is consistent
- **WHEN** the rider reopens a favorited item's detail screen
- **THEN** its favorite control is shown as selected

### Requirement: Routes can be pinned to Nearby
The route-detail pin control SHALL add the route to, or remove it from, the pinned routes shown first in the Nearby tab for the app session. Pinned routes SHALL NOT have a section heading; each pinned card SHALL instead show a small thumbtack in its top-right corner that does not overlap the live signal. Unpinned routes SHALL appear in the regular nearby list without a thumbtack, and each route SHALL appear exactly once.

#### Scenario: Rider pins a route
- **WHEN** the rider pins route 51 and returns to Nearby
- **THEN** route 51 appears with a thumbtack above the other nearby routes and not in the regular list, and no "Pinned" heading is shown

#### Scenario: Rider unpins a route
- **WHEN** the rider unpins the Ronkonkoma Branch
- **THEN** it moves into the regular nearby list

### Requirement: Current-location controls give feedback
Every current-location control SHALL visibly enter a selected, centered state when pressed, and SHALL report that state to assistive technology.

#### Scenario: Rider centers the home map
- **WHEN** the rider presses the home or Route Results current-location control
- **THEN** the control shows its selected state and its accessibility state reports selected
