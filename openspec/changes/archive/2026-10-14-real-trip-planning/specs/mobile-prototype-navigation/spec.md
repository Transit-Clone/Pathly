# Spec Delta

## ADDED Requirements

### Requirement: Real transit trip planning
Route Results SHALL show real public-transit itineraries between the chosen origin and destination, computed by a routing service that knows the region's transit schedules (subway, bus, commuter rail, and walking between them). A single search SHALL offer several alternatives when the routing service has them, typically up to four. Each itinerary SHALL describe its ordered steps:
- walking steps, with duration and distance;
- transit steps, with the operating agency, the line's name, short name, and color, the vehicle type, the headsign, the boarding and alighting stops with their scheduled times, and the number of stops ridden.

Each itinerary SHALL also give its total duration, its departure and arrival times, its number of transfers, and a fare:
- the routing service's own fare, when it has one for every step;
- otherwise, the fare the app computes from the agencies' published fares: the NYC subway and local bus, NICE, and Suffolk County Transit flat fares with their transfer rules, and the LIRR's zone-to-zone peak and off-peak fares. A computed fare SHALL be the full adult one-way fare and SHALL be shown like the routing service's fares, not marked as approximate;
- when any step's agency or LIRR station has no published fare the app knows, the itinerary SHALL say the fare is unavailable rather than show an invented number.

When the origin is "Current location", the rider's current position SHALL be used. When that position is unknown, Route Results SHALL ask the rider to choose an origin instead of planning from a guessed location.

Requests SHALL go through the app's backend, so routing credentials never ship in the app. Requests SHALL be limited to signed-in riders, rate-limited per rider, and restricted to endpoints within the app's service area.

#### Scenario: Rider plans a real trip
- **WHEN** the rider at Stony Brook University chooses Penn Station as the destination with "Leave now"
- **THEN** Route Results lists real itineraries, such as LIRR via Ronkonkoma or Port Jefferson Branch trains, with real departure and arrival times after now, and each card's steps match the trip the routing service returned

#### Scenario: Several ways to go
- **WHEN** the routing service returns a primary itinerary and three alternatives
- **THEN** all four appear as separate cards, with no duplicates

#### Scenario: Fare computed from published fares
- **WHEN** the routing service gives no fare for an itinerary that rides Suffolk bus 51 and then the LIRR from Ronkonkoma to Penn Station off-peak
- **THEN** the card shows the Suffolk fare plus the LIRR off-peak fare for those two stations' zones, with no "~" or estimate marker

#### Scenario: Fare is unknown for a step
- **WHEN** an itinerary uses an agency the app has no published fare for
- **THEN** that card shows that the fare is unavailable instead of a number

#### Scenario: Location unknown for a "Current location" origin
- **WHEN** the origin is "Current location" and the rider's location is unavailable
- **THEN** Route Results asks the rider to choose a starting point and does not request trips

#### Scenario: Endpoint outside the service area
- **WHEN** an endpoint lies outside the NYC, Nassau, and Suffolk service area
- **THEN** no trips are requested and Route Results explains that the trip is outside the area Pathly covers

### Requirement: Planned trip details provide trip interactions
The planned trip-detail screen SHALL provide Back navigation, favorite state, current-location recentering, route-leg review, and a trip action using local state.

A planned trip SHALL show the itinerary it was opened from, unchanged by later refreshes or criteria changes on Route Results. Starting it SHALL make that same itinerary the active trip.

Ending the active trip SHALL first ask the rider to confirm. Confirming SHALL end the trip; cancelling SHALL keep it in progress with nothing changed.

#### Scenario: Rider ends a trip
- **WHEN** the rider presses END on the trip in progress
- **THEN** a dialog asks "End this trip?", and the trip ends only if the rider chooses End trip

#### Scenario: Rider changes their mind about ending
- **WHEN** the rider presses END and then Cancel
- **THEN** the dialog closes and the trip is still in progress, with END still shown

#### Scenario: Planned trip stays as opened
- **WHEN** the rider starts an itinerary, returns to Route Results, and refreshes into a list that no longer contains it
- **THEN** that trip stays the active trip: other listed trips open with GO, not END, and once its card is listed again it opens as the trip in progress

#### Scenario: Rider uses map actions
- **WHEN** the rider favorites a trip or activates the current-location control on the trip-detail screen
- **THEN** the selected control provides visible local state feedback without requiring persistence or location services

## MODIFIED Requirements

### Requirement: Home transit content includes recents and additional routes
The Recents tab SHALL NOT show sample or invented trips. Until the app records the rider's own trips, it SHALL show an empty state saying there are no recent trips yet. Nearby transit SHALL include Suffolk County Transit 51 and MTA Subway 7 in addition to the existing routes, with direction and prediction data consistent with the current card model.

#### Scenario: Rider opens recent trips
- **WHEN** the rider selects the Recents tab before any trips have been recorded
- **THEN** the tab shows "No recent trips yet" and no trip cards

#### Scenario: Rider browses nearby routes
- **WHEN** the nearby list is visible
- **THEN** route 51 and subway 7 appear alongside the existing route cards

### Requirement: Session favorites appear in the Favorites tab
Riders SHALL be able to save and unsave routes from route detail with a single star control, and to favorite and unfavorite trips from planned trip detail. Every saved route and favorited trip SHALL appear in the home Favorites tab, grouped into Routes and Trips, in the order it was saved. Selecting one SHALL open its detail screen. Saved and favorite state SHALL be consistent wherever the item is shown and SHALL last for the app session without any backend.

#### Scenario: Rider favorites a route
- **WHEN** the rider saves a route with the star on its detail screen and returns home to the Favorites tab
- **THEN** that route appears under Routes and opens its route detail when selected

#### Scenario: Rider favorites a trip
- **WHEN** the rider favorites a planned trip and opens the Favorites tab
- **THEN** that trip appears under Trips with its route badges and destination, and opens its trip detail when selected

#### Scenario: Rider removes a favorite
- **WHEN** the rider unsaves a route or unfavorites a trip from its detail screen
- **THEN** it no longer appears in the Favorites tab, and the empty state returns when nothing is saved

#### Scenario: Favorite state is consistent
- **WHEN** the rider reopens a saved route's or favorited trip's detail screen
- **THEN** its star control is shown as selected


### Requirement: Search selection opens route results
Each place suggestion and recent search row SHALL be selectable and SHALL open a Route Results screen. Route Results SHALL use the selected place as the destination and current location as the default origin. For a place suggestion, the destination SHALL be the resolved Google place's display name, and trips SHALL be planned to that place. Itineraries SHALL be real transit trips (see "Real transit trip planning").

#### Scenario: Rider selects a destination match
- **WHEN** the rider selects a visible search result
- **THEN** Route Results opens with the selected destination and starts loading real transit itineraries from the rider's current location

### Requirement: Route Results supports editable trip criteria
Route Results SHALL display separate origin and destination fields that can be changed at any time. Each field SHALL be a control that, when activated, opens the destination search page for that endpoint. That page SHALL behave exactly like the original destination search: Google Places autocomplete limited to the service area, the same loading, empty, error, and unconfigured states, and session recent searches. When editing the origin, a "Current location" option SHALL appear first. Choosing a place SHALL set that endpoint and return to Route Results with the other endpoint and every other trip criterion unchanged; cancelling SHALL return to Route Results with nothing changed. The fields SHALL NOT accept typed text directly. The swap control SHALL exchange the two endpoints. Any change to an endpoint SHALL plan the trip again.

Route Results SHALL also display a leave-time control, a refresh control, a Modes control, and a Filter control.

- **Leave time:**
  - The control SHALL open a time picker offering Leave now, Depart at, and Arrive by, with scrollable hour, minute (5-minute increments), and AM/PM selections.
  - Depart at and Arrive by SHALL mean the next occurrence of the chosen clock time: today if it is still ahead, otherwise tomorrow, which the control SHALL then indicate.
  - After the rider confirms, the control SHALL display the chosen mode and time, and trips SHALL be planned again for that time.
  - With Depart at, no itinerary SHALL depart before the chosen time. With Arrive by, no itinerary SHALL arrive after it.
- **Filter:**
  - Filter SHALL offer selectable Fastest, Fewer transfers, and Lowest fare preferences.
  - Fastest SHALL order itineraries by earliest arrival.
  - Fewer transfers SHALL plan the trip again with a preference for fewer transfers, and order the results by transfer count, then by arrival.
  - Lowest fare SHALL order itineraries by their fare, with itineraries whose fare is unavailable listed last.
- **Modes:**
  - The Modes control SHALL let the rider include or exclude Subway, Bus, and LIRR. The commuter-rail option SHALL be labeled "LIRR", the only commuter rail the app covers, not "Rail" or "Train".
  - The exclusions SHALL be passed to the routing service as a preference.
  - The app SHALL also hide any itinerary that still uses an excluded mode.
- **Refresh:**
  - Refresh SHALL preserve the current trip criteria and plan the trip again.
  - An "Updated" label SHALL show how long ago the shown results were planned.

#### Scenario: Rider changes an endpoint
- **WHEN** the rider taps the destination field, types "stony", and picks Stony Brook University from the autocomplete suggestions
- **THEN** Route Results shows Stony Brook University as the destination, with the origin, leave time, modes, and filter unchanged, and real itineraries to Stony Brook University load

#### Scenario: Rider changes the origin back to their location
- **WHEN** the rider taps the origin field and chooses "Current location"
- **THEN** Route Results shows "Current location" as the origin and plans from the rider's position

#### Scenario: Rider cancels editing an endpoint
- **WHEN** the rider taps an endpoint field and then cancels the search
- **THEN** Route Results returns with both endpoints, every trip criterion, and the shown itineraries unchanged

#### Scenario: Rider changes route preference
- **WHEN** the rider selects Fastest, Fewer transfers, or Lowest fare from Filter
- **THEN** that preference is visibly selected and the itineraries are ordered by that preference, with Fewer transfers also planning the trip again

#### Scenario: Rider picks a departure time
- **WHEN** the rider opens the leave-time control, chooses Depart at 10:30 AM at 9:00 AM, and confirms
- **THEN** the control reads "Depart 10:30 AM" and every itinerary departs at or after 10:30 AM today

#### Scenario: Rider picks a time that has already passed today
- **WHEN** at 11:00 PM the rider chooses Depart at 7:00 AM and confirms
- **THEN** the control indicates tomorrow and the itineraries depart at or after 7:00 AM tomorrow

#### Scenario: Rider picks an arrival deadline
- **WHEN** the rider chooses Arrive by 12:00 PM and confirms
- **THEN** the control reads "Arrive by 12:00 PM" and every itinerary arrives at or before 12:00 PM

#### Scenario: Rider cancels the picker
- **WHEN** the rider dismisses the time picker without confirming
- **THEN** the previous leave-time choice and the shown itineraries are unchanged

#### Scenario: Chosen time carries into trip details
- **WHEN** the rider opens an itinerary after choosing a time
- **THEN** the planned trip detail's leave and arrive times match that itinerary's card

#### Scenario: Rider filters by mode
- **WHEN** the rider excludes LIRR in Modes
- **THEN** the trip is planned again preferring the remaining modes, any itinerary still containing an LIRR leg is hidden, and if none remain an empty state with a reset action is shown

#### Scenario: Rider changes departure time or refreshes
- **WHEN** the rider confirms a new leave time or uses the refresh control
- **THEN** the trip is planned again, keeping the current origin, destination, mode filter, and preference (and the new time choice), and the "Updated" label shows when the new results were planned

### Requirement: Route Results presents comparable itineraries
Route Results SHALL show the planned itineraries as cards, ordered by the selected preference.

- **Card contents:**
  - On the left, each card SHALL show colored boxes for its ordered transit legs, in each line's own color and short name, with a walking indicator only when walking dominates the trip.
  - On the right, it SHALL show the fare (or that it is unavailable) and the total trip duration.
  - Along the bottom, it SHALL show its timing: with Leave now, how soon the first departure is and the departure and arrival times; otherwise, the departure and arrival times.
  - No card SHALL be labeled as a best match or recommendation; the order reflects the selected preference.
  - Cards SHALL NOT include Go or End buttons. Selecting a card SHALL open its planned trip detail, where the rider starts or ends the trip.
- **Loading:** while itineraries load, Route Results SHALL show pulsing placeholder cards shaped like itinerary cards, and SHALL keep showing the previous results during a refresh.
- **No results:** when the routing service finds no trip, Route Results SHALL say that no transit trips were found for the chosen time and offer changing the leave time.
- **Failure:** when the request fails, Route Results SHALL say that trips couldn't be loaded and offer retrying, without technical details.

#### Scenario: Rider compares trip options
- **WHEN** Route Results has loaded several itineraries
- **THEN** they can be compared by lines, transfers, fare, duration, and departure and arrival times

#### Scenario: Results are loading
- **WHEN** the rider opens Route Results and the first itineraries have not arrived
- **THEN** placeholder cards pulse where the itineraries will appear, and nothing claims there are no trips

#### Scenario: No transit at that hour
- **WHEN** the routing service returns no itineraries for the chosen time
- **THEN** Route Results says no transit trips were found for that time and offers changing the leave time

#### Scenario: Planning fails
- **WHEN** the request for itineraries fails or times out
- **THEN** Route Results says trips couldn't be loaded and offers a retry that plans the trip again

#### Scenario: Rider starts a trip from results
- **WHEN** the rider wants to begin a listed itinerary
- **THEN** they open its card and use GO on the trip detail, because the result cards themselves have no Go or End buttons

### Requirement: Expanded prototype remains local
Route details, preferences, refresh feedback, and profile settings SHALL use deterministic local data and component state, except where another requirement names a live source. Destination-search suggestions are an exception (Google Maps place search), and so are trip results (the app's backend trip planning). The prototype MUST remain usable before Firebase services or the place-search API key are configured.

#### Scenario: Prototype runs without backend route data
- **WHEN** Firebase is unconfigured or unavailable
- **THEN** the navigation flows remain usable, Route Results shows its non-technical "couldn't load trips" state, and no technical failure is displayed

#### Scenario: Prototype runs without place search
- **WHEN** the place-search API key is unconfigured or the service is unreachable
- **THEN** every flow other than live place suggestions remains usable, and search shows a non-technical unavailable message

## REMOVED Requirements

### Requirement: Planned and recent trip details share interactions
**Reason**: The recent-trip detail screen only ever showed hard-coded sample trips, which are removed. Its planned-trip half continues as "Planned trip details provide trip interactions", which adds confirming before a trip ends.
**Migration**: None for riders. Recent-trip details return with the later change that records real trips.
