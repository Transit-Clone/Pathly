# Spec Delta

## Purpose

Lets riders find any real destination (address, business, landmark, or station) by name through Google Maps place search, so a trip can be planned to the place they actually mean.

## ADDED Requirements

### Requirement: Live place suggestions
While the rider types a non-empty query, the destination-search screen SHALL show place suggestions from Google Maps place search. Each suggestion row SHALL follow the standard Google Maps search presentation: a location-pin icon on the left, the place name or street address as a bold primary line, and the locality or remaining address as a muted secondary line, with rows separated by thin dividers. The screen SHALL wait until the rider pauses typing before it requests suggestions. It SHALL ignore responses for queries that are no longer current, and it SHALL NOT send a request for an empty or whitespace-only query.

#### Scenario: Rider types a real address
- **WHEN** the rider types "100 Nicolls Rd" and pauses
- **THEN** the results list shows matching Google places, each with a pin icon, a bold name line, and an address line

#### Scenario: Rider keeps typing
- **WHEN** the rider types several characters in quick succession
- **THEN** only the query current after the pause is requested, and suggestions for earlier partial queries never replace newer ones

#### Scenario: Rider clears the query
- **WHEN** the rider clears the search field
- **THEN** no request is sent and the list returns to the "Recent" entries

### Requirement: Suggestions stay within the service area
Suggestion requests SHALL be restricted to the Pathly service area (New York City, Nassau County, and Suffolk County), as defined by the same service-area bounds the map uses. Places outside the service area SHALL NOT be suggested, even when they match the query more closely.

#### Scenario: Ambiguous street name
- **WHEN** the rider searches for an address that also exists in other states
- **THEN** only matches within the service area are suggested

#### Scenario: Destination outside the service area
- **WHEN** the rider searches for a place that exists only outside the service area
- **THEN** that place is not suggested and the "No places found" state is shown if nothing else matches

### Requirement: Search states are communicated
The results list SHALL show a loading state while suggestions are pending. It SHALL show a "No places found" empty state when a completed request returns no suggestions. It SHALL show a non-technical error message with a retry action when a request fails. Loading, empty, and error changes SHALL be announced to assistive technology.

#### Scenario: Request in flight
- **WHEN** a suggestion request has been sent and has not completed
- **THEN** the list indicates that results are loading

#### Scenario: Network failure
- **WHEN** a suggestion request fails because of a network or service error
- **THEN** the list says results couldn't be loaded and offers a retry, without showing raw error text

### Requirement: Selecting a suggestion resolves the place
Selecting a suggestion SHALL resolve that place's display name, formatted address, and coordinates before it opens Route Results. While the place is resolving, the selected row SHALL indicate progress and further selections SHALL be ignored. If resolution fails, the rider SHALL stay on the search screen and see an error message.

#### Scenario: Rider picks a suggestion
- **WHEN** the rider selects a suggestion
- **THEN** Route Results opens with that place's display name as the destination

#### Scenario: Place details fail to load
- **WHEN** the rider selects a suggestion and its details cannot be retrieved
- **THEN** the rider remains on the search screen with an error message and can select again

### Requirement: Session recent searches
The "Recent" list SHALL show each entry with a clock icon in place of the pin icon, and SHALL show places the rider selected during the current app session, most recent first and without duplicates, followed by the existing sample recents. The list SHALL be limited to a small fixed number of entries. Recents SHALL NOT be persisted beyond the app session. Selecting a recent SHALL open Route Results without another place-search request.

#### Scenario: Rider searches again
- **WHEN** the rider selects a place, returns home, and opens search again
- **THEN** that place appears first in the "Recent" list

### Requirement: Search degrades without configuration
When no Google place-search API key is configured, the search screen SHALL still open and show the Recent list. A typed query SHALL show a message that place search is unavailable instead of failing silently or crashing. The API key SHALL NOT be shown in the interface or logs.

#### Scenario: Missing API key
- **WHEN** the app runs without a place-search API key and the rider types a query
- **THEN** the list says place search is unavailable, and the Recent entries remain selectable after the query is cleared
