# Spec Delta

## ADDED Requirements

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
