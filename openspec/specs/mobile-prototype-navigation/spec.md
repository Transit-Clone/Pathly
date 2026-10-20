# Mobile Prototype Navigation Specification

## Purpose

Defines the connected, mock-data-driven mobile prototype flows riders use to browse nearby service, inspect any route, plan a trip to a searched destination, revisit recent trips, and view placeholder account settings.

## Requirements

### Requirement: Live predictions use a wireless signal
Every live minute prediction SHALL display a two-arc wireless signal beside the upper-right of its numeric time, while the number itself stays horizontally centered over its `minutes` label. The arcs SHALL be thick with rounded ends, with no source dot, and each arc SHALL fade between lower and full opacity independently, the outer arc trailing the inner one, to indicate live data. The fade SHALL stop, leaving the signal fully opaque, when the app's Reduce motion setting or the device's reduce-motion preference is on. Scheduled predictions SHALL display no wireless signal and SHALL retain their scheduled treatment.

#### Scenario: Live and scheduled values appear together
- **WHEN** a screen renders both live and scheduled predictions
- **THEN** only live values have the two-arc signal and scheduled values remain visually distinct without it

#### Scenario: Live signal pulses
- **WHEN** a live prediction is visible and reduce motion is off
- **THEN** its inner and outer arcs fade out and back in one after the other, each over a cycle of about 1.8 seconds

#### Scenario: Reduce motion stops the pulse
- **WHEN** the rider turns on Reduce motion in Settings or the device prefers reduced motion
- **THEN** live signals stop fading and remain fully visible

### Requirement: Home transit content includes recents and additional routes
The Recents tab SHALL NOT show sample or invented trips. Until the app records the rider's own trips, it SHALL show an empty state saying there are no recent trips yet. Nearby transit SHALL include Suffolk County Transit 51 and MTA Subway 7 in addition to the existing routes, with direction and prediction data consistent with the current card model.

#### Scenario: Rider opens recent trips
- **WHEN** the rider selects the Recents tab before any trips have been recorded
- **THEN** the tab shows "No recent trips yet" and no trip cards

#### Scenario: Rider browses nearby routes
- **WHEN** the nearby list is visible
- **THEN** route 51 and subway 7 appear alongside the existing route cards

### Requirement: Every nearby route opens route details
Every route card shown on the home screen SHALL be selectable and SHALL open a detail screen populated with that route's identity, direction, color, prediction tiles, alerts, map line, and stop timeline.

#### Scenario: Rider selects any route
- **WHEN** the rider selects an existing or newly added route card
- **THEN** a detail screen for that route opens instead of leaving the card inert

#### Scenario: Rider returns from route details
- **WHEN** the rider activates Back from any route detail
- **THEN** the home screen is restored

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

### Requirement: Profile control opens placeholder settings
The profile control on the home screen SHALL open a navigable Profile & Settings hub with an account summary, Account details, Notifications, Accessibility, Privacy, Travel preferences, Saved places, Help & About, and a visible Sign out action. Each settings row SHALL open a dedicated local prototype screen with representative information and controls. Prototype actions SHALL remain local and MUST NOT authenticate, persist account changes outside the running app, request real device permissions, modify remote data, or sign out of a real service.

#### Scenario: Rider opens and closes profile
- **WHEN** the rider selects the home profile control
- **THEN** the Profile & Settings hub opens and provides Back navigation to home

#### Scenario: Rider views account actions
- **WHEN** the Profile & Settings hub is visible
- **THEN** the account summary, settings categories, and Sign out action are displayed

#### Scenario: Rider opens a settings category
- **WHEN** the rider selects Account details, Notifications, Accessibility, Privacy, Travel preferences, Saved places, or Help & About
- **THEN** a dedicated screen opens with a clear title, representative content and controls, and Back navigation to the settings hub

#### Scenario: Rider changes a prototype setting
- **WHEN** the rider changes a toggle, selector, text value, or saved-place control
- **THEN** the screen provides visible local feedback without implying that a backend, device permission, or remote account was changed

#### Scenario: Rider selects sign out
- **WHEN** the rider selects Sign out
- **THEN** the prototype explains that real sign-out will be available after authentication is implemented and remains on the local settings flow

### Requirement: Expanded prototype remains local
Route details, preferences, refresh feedback, and profile settings SHALL use deterministic local data and component state, except where another requirement names a live source. Destination-search suggestions are an exception (Google Maps place search), and so are trip results (the app's backend trip planning). The prototype MUST remain usable before Firebase services or the place-search API key are configured.

#### Scenario: Prototype runs without backend route data
- **WHEN** Firebase is unconfigured or unavailable
- **THEN** the navigation flows remain usable, Route Results shows its non-technical "couldn't load trips" state, and no technical failure is displayed

#### Scenario: Prototype runs without place search
- **WHEN** the place-search API key is unconfigured or the service is unreachable
- **THEN** every flow other than live place suggestions remains usable, and search shows a non-technical unavailable message

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

### Requirement: Current-location controls give feedback
Every current-location control SHALL visibly enter a selected, centered state when pressed, and SHALL report that state to assistive technology.

#### Scenario: Rider centers the home map
- **WHEN** the rider presses the home or Route Results current-location control
- **THEN** the control shows its selected state and its accessibility state reports selected

### Requirement: Live departures follow the nearest station
For a route with live data, the live departure predictions shown on the home route card and the route-detail tiles SHALL be the departures from the route's station nearest to the rider's current location. When location is unavailable or permission is denied, predictions SHALL use the default station (Stony Brook). The route-detail stop timeline SHALL be timed so that the nearest station's time matches the first prediction.

#### Scenario: Rider is closest to Stony Brook
- **WHEN** the rider's GPS position is closest to Stony Brook and they open the Port Jefferson Branch
- **THEN** the countdown tiles show departures from Stony Brook, and Stony Brook's time in the stop list equals now plus the first tile's minutes

#### Scenario: Rider is closer to another station
- **WHEN** the rider's GPS position is closest to Smithtown
- **THEN** the countdown tiles show departures from Smithtown instead of Stony Brook

### Requirement: Nearby search responds quickly after the backend is idle
The first nearby transit search handled by a backend instance that has just started (after being idle) SHALL NOT need to read every agency's full published timetable. The searched timetable data SHALL be prepared once when the backend is deployed. Under that preparation, a cold nearby search SHALL return within a few seconds rather than the roughly 18 seconds a full timetable scan takes. The routes, stops, departures, and route geometry returned SHALL be identical to those derived from the full timetables. A deploy SHALL fail rather than ship without the prepared data for every configured agency. When the prepared data is absent (for example in local development before it is generated), the backend SHALL still answer correctly from the full timetables, only more slowly.

#### Scenario: First search after the backend was idle
- **WHEN** a rider at Stony Brook opens the app and the nearby search lands on a freshly started backend instance
- **THEN** nearby routes come back within a few seconds instead of about 18 seconds

#### Scenario: Prepared data matches the timetable
- **WHEN** the same nearby search, route departures, or route geometry request is answered from the prepared data and from the full timetables
- **THEN** both answers are identical

#### Scenario: Deploy without prepared data
- **WHEN** a contributor deploys the backend and the prepared data for any agency cannot be built or is out of date with its timetable
- **THEN** the deploy stops with an error instead of shipping a backend without it

#### Scenario: Local development before preparation
- **WHEN** a contributor runs the backend locally without having generated the prepared data
- **THEN** every request still returns correct results, read from the full timetables

### Requirement: Saved routes lead the Nearby list
Routes the rider has saved SHALL appear first in the Nearby tab, each marked with a small filled star in its top-right corner that does not overlap the live signal, without a section heading. A saved route SHALL NOT also appear in the regular nearby list. Unsaving a route SHALL return it to the regular nearby list when it is nearby. The app SHALL NOT save any route by default.

#### Scenario: Rider saves a nearby route
- **WHEN** the rider saves the 51 from its detail screen and returns to Nearby
- **THEN** the 51 appears above the other nearby routes with a star marker and not in the regular list

#### Scenario: Rider unsaves a route
- **WHEN** the rider unsaves that route
- **THEN** it returns to the regular nearby list and disappears from Favorites

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

### Requirement: Route detail stays open while location updates
Once the rider opens a route detail screen, the app SHALL keep showing that route until the rider leaves it, even when the rider's location updates and the nearby list is re-fetched or no longer contains that route.

#### Scenario: Rider reads a route while walking
- **WHEN** the rider has a route detail open and their GPS position changes enough to refresh the nearby list
- **THEN** the route detail stays open and continues updating, with no jump back to Home

### Requirement: Home map keeps the rider's view
The home map SHALL center on the rider when their first location fix arrives and whenever the rider presses the location button. Later location updates SHALL move the rider's location dot but SHALL NOT move the map. After the rider pans or zooms the map, it SHALL stay where they left it until they press the location button again.

#### Scenario: Rider pans away and waits
- **WHEN** the rider drags the home map away from their location and several GPS updates arrive over the next minute
- **THEN** the map stays where the rider left it, and only the blue dot moves

#### Scenario: Rider recenters
- **WHEN** the rider then presses the location button
- **THEN** the map centers on their current location

### Requirement: Live data is fetched only for visible routes
The app SHALL request live departures and vehicles only for routes the rider can currently see:
- home transit cards on screen in the active tab;
- the open route detail.

Routes that leave the screen SHALL stop being refreshed and SHALL keep their last loaded data, so a card scrolled back into view shows that data immediately. A route that comes into view SHALL be requested right away and then refreshed on the normal interval while visible. Routes on inactive tabs or hidden screens SHALL NOT be requested.

#### Scenario: Rider sees the first cards
- **WHEN** the home screen shows three Nearby cards and the rider's location has 20 nearby routes
- **THEN** live data is requested for the visible cards' routes, not all 20

#### Scenario: Rider scrolls the list
- **WHEN** the rider scrolls Nearby to reveal more cards
- **THEN** the newly visible cards' routes are requested right away, and routes scrolled out of view stop refreshing but keep their last times

#### Scenario: Rider opens a route
- **WHEN** the rider opens a route detail
- **THEN** that route keeps refreshing while the detail is open, and the home cards behind it are not refreshed

### Requirement: Last data shows at once when reopening
The app SHALL remember on the device the last nearby list found around the rider's own location, and the most recent live departures. On launch, a nearby list saved within the last 24 hours SHALL be shown immediately, marked as updating, until the fresh search replaces it. Live departures saved within the last 10 minutes SHALL be shown for cards still waiting on fresh data, aged from when they were fetched (past departures dropped) and without vehicle positions. Saved data SHALL never replace fresher data, and an area explored with the map center search SHALL NOT be saved as the rider's surroundings.

#### Scenario: Reopening on a slow backend
- **WHEN** the rider reopens the app and the backend is slow to answer
- **THEN** the last nearby cards appear at once with an updating indicator, and a card fetched a minute ago at 9 minutes reads 8 minutes

#### Scenario: Saved data is too old
- **WHEN** the saved nearby list is more than a day old
- **THEN** the app shows its normal loading state instead

### Requirement: Route detail geometry is served from prepared data
A route's station sequence, headsign, scheduled stop offsets, and drawn line for each direction SHALL be prepared ahead of time whenever the backend's timetable data is prepared. A route-detail request SHALL then be answered without reading the route's full timetable or the agency's full shape data. The prepared answer SHALL be identical to the one derived from the full timetable. A route and direction with no scheduled trips SHALL still be reported as not found. When prepared data is absent, the backend SHALL still return the same geometry, derived from the full timetable, only more slowly.

#### Scenario: Opening a route on a freshly started backend
- **WHEN** a rider opens the Port Jefferson Branch route detail and the request lands on a freshly started backend instance
- **THEN** the station list and route line come back without the backend reading the LIRR's full stop-times or shapes data

#### Scenario: Prepared geometry matches the timetable
- **WHEN** the same route and direction is answered from prepared data and from the full timetable
- **THEN** both answers are identical, including headsign, stop order, stop offsets, and line points

#### Scenario: Direction with no trips
- **WHEN** a rider's app requests geometry for a route direction that has no scheduled trips
- **THEN** the backend reports it as not found, as it does today

### Requirement: Daily timetable updates keep prepared data
When the backend replaces a deployed timetable with a newer daily timetable, the newer timetable SHALL come with the same prepared data a deploy produces: the stop-to-routes index, the per-route stop times, and the route geometry. A freshly started backend instance using the daily timetable SHALL use that prepared data rather than scanning the full timetable. A daily timetable published before prepared data existed SHALL gain it at the next daily update, even when the agency's feed itself has not changed. If the prepared data for a daily timetable is missing, unreadable, or from an older format, the backend SHALL still answer correctly from that timetable's full data, only more slowly.

#### Scenario: Cold search on today's timetable
- **WHEN** the daily update has published a new subway timetable and a rider's nearby search lands on a freshly started backend instance
- **THEN** the search uses the prepared data for that timetable and does not scan the subway's full stop-times file

#### Scenario: Backfilling an existing timetable
- **WHEN** the daily update runs and an agency's current published timetable has no prepared data, but its feed is unchanged
- **THEN** prepared data is built and published for that timetable without changing which timetable version riders see

#### Scenario: Prepared data unavailable
- **WHEN** a backend instance loads a daily timetable whose prepared data is missing or fails verification
- **THEN** every request still returns the same results as before, read from the full timetable

### Requirement: The backend is warmed when the app opens
When the app starts with a signed-in rider, or a rider signs in, the app SHALL ask the nearby-search and route-detail backends to start preparing, without waiting for an answer and without showing anything to the rider. A warm-up SHALL NOT return transit data and SHALL count toward the rider's usage limits like any other request. The rider's first real nearby search and first route-detail request SHALL wait for the matching warm-up to finish, up to a limit, before they are sent. A warm-up that fails or exceeds the limit SHALL NOT delay or fail the real request beyond that limit. Each warm-up SHALL be sent at most once per app session and signed-in rider.

#### Scenario: App opens while the rider is still being located
- **WHEN** a signed-in rider opens the app and the backend has been idle
- **THEN** the backend begins starting up while the app waits for the rider's location, and the first nearby search arrives at the started backend rather than starting another one

#### Scenario: Warm-up fails
- **WHEN** the warm-up request fails or is rejected
- **THEN** the nearby search and route detail still load normally, and no error is shown for the warm-up

#### Scenario: Signed-out launch
- **WHEN** the app opens with no rider signed in
- **THEN** no warm-up is sent until a rider signs in

### Requirement: Real transit trip planning
Route Results SHALL show real public-transit itineraries between the chosen origin and destination, computed by a routing service that knows the region's transit schedules (subway, bus, commuter rail, and walking between them). A single search SHALL offer several alternatives when the routing service has them, typically up to four. Each itinerary SHALL describe its ordered steps:
- walking steps, with duration and distance;
- transit steps, with the operating agency, the line's name, short name, and color, the vehicle type, the headsign, the boarding and alighting stops with their scheduled times, and the number of stops ridden. When the step matches a scheduled trip in the app's own timetables, it SHALL also list the stops in between, in order, with each stop's name, location, and scheduled time. A step SHALL be matched only when one scheduled trip of a line serving both stops leaves the boarding stop within 2 minutes of the routing service's departure time and reaches the alighting stop after it; otherwise it SHALL carry no intermediate stops rather than a guessed list.

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

#### Scenario: Stops in between come from the timetable
- **WHEN** a planned trip rides the LIRR Port Jefferson Branch from Stony Brook to Huntington, and the timetable has that departure
- **THEN** the transit step lists the stops between Stony Brook and Huntington with their scheduled times, and their number matches the step's stop count

#### Scenario: A leg with no timetable match
- **WHEN** a transit step is on an agency whose timetable the app doesn't have, or no scheduled trip fits its departure time
- **THEN** the step carries its stop count and no intermediate stops

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

### Requirement: City buses and NYC Ferry are covered
In addition to the subway, LIRR, NICE, and Suffolk County Transit, the app SHALL cover NYC Transit's Bronx, Brooklyn, Manhattan, Queens, and Staten Island buses, MTA Bus Company, and NYC Ferry, each from its operator's official schedule data. Their routes SHALL appear in Nearby, open route detail and departures pages, and take part in every feature built on the app's timetables (such as trip stop lists and stop search), in the same way as the existing agencies.

Live predictions and vehicle positions SHALL come from MTA Bus Time for buses, and live predictions from NYC Ferry's real-time feed for ferries. NYC Ferry publishes no vehicle positions, so ferry routes SHALL show predictions without live vehicles. When a live source is unconfigured or unavailable, these routes SHALL fall back to scheduled times, marked as untracked, as the existing agencies do.

A bus's badge SHALL show its full route name, including any SBS or express designation (for example "SIM3C" or "M15-SBS").

#### Scenario: Rider near a city bus stop
- **WHEN** the rider is near a Manhattan stop served by the M15 and M15-SBS
- **THEN** both routes appear in Nearby with their upcoming departures and open their route detail pages

#### Scenario: Ferry route without live boats
- **WHEN** the rider opens an NYC Ferry route
- **THEN** its departures show live predictions when the ferry feed has them, and the map shows the route and its landings without vehicle markers

#### Scenario: Bus Time is not configured
- **WHEN** the backend has no MTA Bus Time key
- **THEN** city bus routes still appear and show their scheduled departures as untracked, and no technical error is shown

### Requirement: Ferry is a trip mode
Route Results SHALL recognize ferry legs from the routing service as a ferry mode, not as an unknown vehicle. Ferry legs SHALL be priced with NYC Ferry's published single-ride fare. The Modes control SHALL offer Ferry alongside Subway, Bus, and LIRR; excluding Ferry SHALL hide any itinerary with a ferry leg.

#### Scenario: Trip with a ferry leg
- **WHEN** an itinerary rides NYC Ferry from Wall St/Pier 11 to East 34th St
- **THEN** its card shows a ferry badge for that leg and includes the ferry fare in the trip fare

#### Scenario: Rider excludes ferries
- **WHEN** the rider excludes Ferry in Modes
- **THEN** itineraries with a ferry leg are hidden
