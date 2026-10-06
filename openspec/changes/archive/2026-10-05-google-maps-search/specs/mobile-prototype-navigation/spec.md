# Spec Delta

## MODIFIED Requirements

### Requirement: Search selection opens route results
Each place suggestion and recent search row SHALL be selectable and SHALL open a Route Results screen. Route Results SHALL use the selected place as the destination and current location as the default origin. For a place suggestion, the destination SHALL be the resolved Google place's display name. Itineraries SHALL remain mock data.

#### Scenario: Rider selects a destination match
- **WHEN** the rider selects a visible search result
- **THEN** Route Results opens with the selected destination and mock transit itineraries

### Requirement: Expanded prototype remains local
All route details, recents, trip results, preferences, refresh feedback, and profile settings SHALL use deterministic local mock data and component state. Destination-search suggestions are the exception: they come from Google Maps place search. The prototype MUST remain usable before Firebase services or the place-search API key are configured.

#### Scenario: Prototype runs without backend route data
- **WHEN** Firebase is unconfigured or unavailable
- **THEN** the navigation flows and mock content remain usable without displaying technical failure state

#### Scenario: Prototype runs without place search
- **WHEN** the place-search API key is unconfigured or the service is unreachable
- **THEN** every flow other than live place suggestions remains usable, and search shows a non-technical unavailable message
