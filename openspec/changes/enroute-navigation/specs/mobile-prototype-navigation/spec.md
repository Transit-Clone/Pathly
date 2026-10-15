# Spec Delta

## MODIFIED Requirements

### Requirement: Home transit content includes recents and additional routes
The Recents tab SHALL NOT show sample or invented trips. Until the app records the signed-in rider's own ended or completed navigation session, it SHALL show an empty state saying there are no recent trips yet. After a session ends, Recents SHALL show that rider's provider-light trip summaries newest first, up to the history limit. Selecting a recent trip SHALL request fresh Route Results for its recorded endpoints rather than replaying stored route content. Nearby transit SHALL include Suffolk County Transit 51 and MTA Subway 7 in addition to the existing routes, with direction and prediction data consistent with the current card model.

#### Scenario: Rider opens recent trips
- **WHEN** the rider selects the Recents tab before any trips have been recorded
- **THEN** the tab shows "No recent trips yet" and no trip cards

#### Scenario: Rider finishes a trip
- **WHEN** the rider completes or confirms ending an active navigation session
- **THEN** its summary appears first in that rider's Recents tab

#### Scenario: Rider selects a recent trip
- **WHEN** the rider activates a trip summary in Recents
- **THEN** Pathly opens Route Results and requests current itineraries for its origin and destination

#### Scenario: Rider browses nearby routes
- **WHEN** the nearby list is visible
- **THEN** route 51 and subway 7 appear alongside the existing route cards

### Requirement: Planned trip details provide trip interactions
The planned trip-detail screen SHALL provide Back navigation, favorite state, current-location recentering, route-leg review, and a trip action.

A planned trip SHALL show the exact retimed itinerary it was opened from, unchanged by later refreshes or criteria changes on Route Results. Starting it SHALL create a distinct active navigation session from that exact shown departure and open active navigation. An already active trip SHALL remain available from a prominent Resume trip control after the rider navigates elsewhere; using Back or returning Home SHALL NOT end it.

Ending the active trip SHALL first ask the rider to confirm. Confirming SHALL end the session and record it in Recents; cancelling SHALL keep it in progress with nothing changed. Starting another planned trip while one is active SHALL likewise require confirmation before the existing session is ended and replaced.

#### Scenario: Rider ends a trip
- **WHEN** the rider presses END on the trip in progress
- **THEN** a dialog asks "End this trip?", and the trip ends only if the rider chooses End trip

#### Scenario: Rider changes their mind about ending
- **WHEN** the rider presses END and then Cancel
- **THEN** the dialog closes and the trip is still in progress, with END still shown

#### Scenario: Planned trip stays as opened
- **WHEN** the rider starts an itinerary and Route Results later refreshes into a list that no longer contains it
- **THEN** the exact selected departure remains active and resumable without being replaced by a refreshed result

#### Scenario: Rider leaves active navigation
- **WHEN** the rider uses Back from active navigation
- **THEN** Home is shown with a prominent control to resume the same active session

#### Scenario: Rider starts another trip
- **WHEN** the rider presses GO on a different planned trip while navigation is active
- **THEN** the existing active trip is not ended or replaced until the rider confirms
#### Scenario: Rider uses map actions
- **WHEN** the rider favorites a planned trip or activates the current-location control on its trip-detail screen
- **THEN** the selected control provides visible state feedback
