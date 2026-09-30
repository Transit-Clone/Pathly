# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
