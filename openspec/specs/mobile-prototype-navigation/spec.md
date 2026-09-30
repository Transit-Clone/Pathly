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
The Recents tab SHALL contain mock destination trips rather than an empty state. Nearby transit SHALL include Suffolk County Transit 51 and MTA Subway 7 in addition to the existing routes, with direction and prediction data consistent with the current card model.

#### Scenario: Rider opens recent trips
- **WHEN** the rider selects the Recents tab
- **THEN** destination-oriented recent trip entries are shown and can be selected to view route results

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
Each destination match and recent search row SHALL be selectable and SHALL open a Route Results screen using the selected place as the destination and current location as the default origin.

#### Scenario: Rider selects a destination match
- **WHEN** the rider selects a visible search result
- **THEN** Route Results opens with the selected destination and mock transit itineraries

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
All route details, recents, trip results, preferences, refresh feedback, and profile settings introduced by this change SHALL use deterministic local mock data and component state. The prototype MUST remain usable before Firebase services are configured or implemented.

#### Scenario: Prototype runs without backend route data
- **WHEN** Firebase is unconfigured or unavailable
- **THEN** the new navigation flows and mock content remain usable without displaying technical failure state

### Requirement: Planned and recent trip details share interactions
Planned and recent trip-detail screens SHALL both provide Back navigation, favorite state, current-location recentering, route-leg review, and a trip action using local state. A recent trip SHALL display its recorded origin, destination, fare, duration, leave and arrive times, transfers, and recency, and SHALL allow the rider to start that route again without rewriting the recorded historical values.

#### Scenario: Rider opens a recent trip
- **WHEN** the rider selects a trip from Recents
- **THEN** the recent-trip detail screen shows the recorded route, fare, duration, timing, route legs, recency, and completed-trip context in the shared trip-detail presentation

#### Scenario: Rider repeats a recent trip
- **WHEN** the rider activates Go on a completed recent trip
- **THEN** the trip enters the existing local active-trip state while the screen retains the selected trip's route and endpoint information

#### Scenario: Rider uses map actions
- **WHEN** the rider favorites a trip or activates the current-location control on either trip-detail screen
- **THEN** the selected control provides visible local state feedback without requiring persistence or location services

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
