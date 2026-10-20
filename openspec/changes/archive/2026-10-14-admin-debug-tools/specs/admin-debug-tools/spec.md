# Spec Delta

## Purpose

Gives the team's admin account tools to test Pathly anywhere and at any time (a mock location and a mock clock) and to see what the app and backend are doing, while keeping those tools invisible and unusable for ordinary riders.

## ADDED Requirements

### Requirement: Admin account is recognized
The app SHALL treat a signed-in account as the admin when its email matches the configured admin email list (by default `admin@gmail.com`), compared case-insensitively. Admin-only backend functions SHALL check this themselves from the caller's verified sign-in, and SHALL reject anyone else, signed in or not, with a permission error. The admin's password SHALL NOT be stored in the repository or the app. Admin screens, banners, and controls SHALL NOT be shown to any other account.

#### Scenario: Admin signs in
- **WHEN** the team signs in as admin@gmail.com
- **THEN** Profile shows an "Admin tools" entry

#### Scenario: Rider signs in
- **WHEN** any other account signs in
- **THEN** no admin entry, banner, or control appears anywhere in the app

#### Scenario: Non-admin calls an admin function
- **WHEN** a non-admin account calls the backend status function directly
- **THEN** the call is rejected with a permission error and returns no data

### Requirement: Admin mock location
The admin SHALL be able to set a mock location by long-pressing the home map, by searching for a place, or by choosing a preset (Stony Brook University, Penn Station, Times Square, Jamaica, St. George Terminal, Wall St/Pier 11, Hicksville, Ronkonkoma). While it's set, every feature that uses the rider's location SHALL use the mock location instead: the home map's location marker and recentering, Nearby, route-detail nearest stops, the "Current location" origin in Route Results, and trip planning. A banner on the home screen SHALL name the mock location and offer to turn it off. The mock location SHALL persist on the device until turned off, and turning it off SHALL return every feature to the real location.

#### Scenario: Admin checks Nearby elsewhere
- **WHEN** the admin, at Stony Brook, sets the mock location to Penn Station
- **THEN** the map centers on Penn Station, Nearby lists the routes serving Penn Station, and the banner reads "Mock location · Penn Station"

#### Scenario: Admin plans from the mock location
- **WHEN** the admin opens Route Results with "Current location" as the origin while a mock location is set
- **THEN** trips are planned from the mock location

#### Scenario: Admin turns it off
- **WHEN** the admin turns off the mock location from the banner
- **THEN** the map, Nearby, and planning use the real location again

### Requirement: Admin mock time
The admin SHALL be able to set the app's current date and time. While it's set, Leave now and the next-occurrence times in Route Results, the "leaves in" labels, and time-dependent fares SHALL use the mock time. Live predictions SHALL stay real-time, and the screens showing them SHALL say they reflect the real current time. A banner SHALL show the mock time and offer to turn it off.

#### Scenario: Admin checks late-night planning
- **WHEN** the admin sets the time to 2:30 AM on a weekday and plans Stony Brook University to Penn Station with Leave now
- **THEN** trips are requested for 2:30 AM on that date, and the results show what is (or isn't) running then

#### Scenario: Live data during mock time
- **WHEN** mock time is set and the admin opens Nearby
- **THEN** the live predictions are labeled as reflecting the real current time

### Requirement: Admin debug panel
Profile SHALL offer the admin an Admin tools screen with:
- **Backend status:** for each agency, the published timetable version and its age, the last refresh outcome, and whether its live feed is configured and responding;
- **Recent requests:** the app's last 20 backend calls, each with its name, duration, and outcome, and for trip planning the request and a summary of the result, each copyable as JSON;
- **Caches:** controls to clear the device cache, clear the trip-plan cache, and refresh live data now;
- **Overlays:** toggles to show route, stop, and trip IDs on route-detail and trip-detail screens, and the coordinates of map taps;
- **Rate limits:** the admin's own remaining request allowance per backend function.

Admin requests SHALL be rate-limited like any rider's.

#### Scenario: Admin diagnoses a missing route
- **WHEN** the admin opens Backend status
- **THEN** each agency shows its timetable version, its age, and whether its live feed is answering, so a stale or failing agency stands out

#### Scenario: Admin inspects a trip request
- **WHEN** the admin plans a trip and opens Recent requests
- **THEN** the planTrip call is listed with its duration, outcome, request, and result summary, and can be copied as JSON

#### Scenario: Admin shows IDs
- **WHEN** the admin turns on the ID overlay and opens a route
- **THEN** the route detail shows the route ID and each stop's stop ID
