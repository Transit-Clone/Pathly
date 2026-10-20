# Spec Delta

## Purpose

Defines how a planned itinerary becomes a resumable, location-aware active trip that guides the rider through arrival and records a useful recent-trip summary.

## ADDED Requirements

### Requirement: GO creates one exact active navigation session
Activating `GO` on a planned trip SHALL create a uniquely identified navigation session from the exact itinerary currently shown, including any departure choices the rider made, and SHALL open active navigation. The session identity SHALL be distinct from the routing provider's itinerary identifier so two departures based on the same itinerary cannot be confused. Departure choices SHALL no longer be editable after that session starts.

Pathly SHALL support at most one active navigation session. Starting a different trip while one is active SHALL require confirmation before replacing it; cancelling SHALL leave the existing session unchanged.

#### Scenario: Rider starts the departure they selected
- **WHEN** the rider selects a later departure on a planned trip and presses `GO`
- **THEN** active navigation uses that departure's times and legs even if it has the same itinerary identifier as the original departure

#### Scenario: Rider tries to replace an active trip
- **WHEN** one trip is active and the rider presses `GO` on another planned trip
- **THEN** Pathly asks whether to end and replace the active trip before changing either session

#### Scenario: Rider cancels replacement
- **WHEN** the rider declines to replace the active trip
- **THEN** the existing session and its progress remain unchanged

### Requirement: Foreground location advances trip progress monotonically
While Pathly is in the foreground, active navigation SHALL evaluate every update from the app's shared rider-location source against the ordered walking paths, boarding points, known intermediate stops, alighting points, transfers, and destination in the active itinerary. Credible movement to the current or a later checkpoint SHALL advance progress. Ordinary GPS noise or a later update near an already completed checkpoint SHALL NOT move progress backward.

When intermediate stops or detailed walking geometry are unavailable, Pathly SHALL use only the known leg endpoints, route path, scheduled times, and stop count; it SHALL NOT invent a stop, street turn, or maneuver. If location is unavailable or cannot be matched confidently to the planned trip, navigation SHALL keep the last confirmed progress, identify that live progress is unavailable or off the planned route, and SHALL NOT silently jump to another leg. Returning to the foreground SHALL request a current fix and catch up against the latest credible checkpoint.

#### Scenario: Rider reaches a boarding stop
- **WHEN** the rider follows the initial walk and arrives at the transit leg's boarding point
- **THEN** progress advances from walking to the boarding or waiting instruction

#### Scenario: Rider passes known transit stops
- **WHEN** successive foreground locations reach later stops on the active transit leg
- **THEN** the current stop advances and the remaining-stop count decreases without revisiting completed stops

#### Scenario: GPS jumps backward
- **WHEN** a location update appears near a checkpoint the rider already completed
- **THEN** the active step and confirmed progress do not regress

#### Scenario: Leg has sparse route data
- **WHEN** a transit leg has a stop count but no matched intermediate-stop list
- **THEN** Pathly guides between its known boarding and alighting points without naming invented stops

#### Scenario: Location cannot update the route
- **WHEN** location permission is unavailable, the fix is stale, or the rider is not credibly near the planned route
- **THEN** the last confirmed instruction remains visible with an explicit location or off-route status and no automatic reroute

### Requirement: Active guidance explains now, next, and arrival
Active navigation SHALL always present the rider's current action, the next known stop or transfer action, and the itinerary's arrival time. During a transit leg it SHALL also show the line identity, destination or headsign, and remaining stops when the intermediate stop sequence is known. Walking guidance SHALL name the known endpoint and distance or duration without claiming turn-by-turn maneuvers that the itinerary does not provide.

The guidance SHALL distinguish waiting to board, riding, transferring, walking, and arrival. Time labels SHALL continue to age from the app's current clock, including the admin mock clock.

#### Scenario: Rider waits to board
- **WHEN** the rider is at the boarding stop before the selected departure
- **THEN** navigation identifies the line, boarding stop, departure time, and the action to board

#### Scenario: Rider is on a transit leg
- **WHEN** progress is between the boarding and alighting checkpoints
- **THEN** navigation shows the line and destination, the next known stop, remaining stops when known, and the trip arrival time

#### Scenario: Rider transfers
- **WHEN** the rider completes one transit leg and has a walk or wait before the next
- **THEN** navigation presents that transfer action before instructing the rider to board the next line

### Requirement: Active navigation can resume after relaunch
Pathly SHALL persist a versioned, signed-in-account-scoped resume reference and the last confirmed progress for an active session. It SHALL NOT persist a complete routing-provider response or completed-trip geometry. The in-memory exact itinerary SHALL be rehydrated from a fresh trip-planning response using the stored request, selected-departure identity, and Pathly-owned schedule identifiers before guidance resumes.

After the same account relaunches Pathly, the app SHALL restore the active-session state and reopen or prominently offer to resume active navigation without resetting confirmed progress. If rehydration is unavailable or cannot reproduce the selected trip safely, Pathly SHALL show a recoverable state with Retry and End trip actions rather than silently discarding the session or substituting a different itinerary. Invalid, incompatible, or stale resume data SHALL fail safely without crashing or appearing to another account.

#### Scenario: App relaunches during a trip
- **WHEN** the rider closes and reopens Pathly under the same account while a recoverable trip is active
- **THEN** the selected trip is rehydrated and active navigation resumes at no earlier than its last confirmed progress

#### Scenario: Resume needs connectivity
- **WHEN** the persisted session exists but its route cannot currently be rehydrated
- **THEN** Pathly keeps the session reference and offers Retry or End trip without showing guidance from a different route

#### Scenario: Another account signs in
- **WHEN** a different account uses the same device
- **THEN** the first account's active trip and history are not shown

#### Scenario: Persisted data is incompatible
- **WHEN** the stored record cannot be validated by the current app version
- **THEN** Pathly does not crash or construct a partial active trip from it

### Requirement: Arrival and ending create one recent-trip record
Reaching the final destination checkpoint SHALL present an arrived state and complete the active session. The rider SHALL also be able to end early from any active-navigation state after confirmation. Either outcome SHALL remove the active session and create exactly one provider-light recent-trip record for that session, including its account owner, origin and destination labels or permitted identifiers, start and end times, completion outcome, and Pathly-owned line or schedule summary needed to render a card and repeat the search. The record SHALL NOT contain copied route geometry or a complete routing-provider response.

Recent-trip history SHALL persist locally per signed-in account, list at most the 20 newest records, and discard the oldest when the limit is exceeded. Selecting a recent trip SHALL start a fresh Route Results search for its recorded endpoints rather than replaying stored route content.

#### Scenario: Rider arrives
- **WHEN** location reaches the active trip's final destination
- **THEN** Pathly shows arrival, clears the active session, and adds one arrived trip to Recents

#### Scenario: Rider ends early
- **WHEN** the rider confirms `End trip` before arrival
- **THEN** Pathly clears the active session and adds one ended-early trip to Recents

#### Scenario: Completion is reported twice
- **WHEN** repeated location or lifecycle events report completion for the same navigation session
- **THEN** only one recent-trip record is created

#### Scenario: Rider repeats a recent trip
- **WHEN** the rider selects a card in Recents
- **THEN** Route Results requests fresh itineraries for that trip's recorded endpoints
