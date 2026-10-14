# Destination Search Specification

## Purpose

Lets riders find any real destination (address, business, landmark, or station) by name through Google Maps place search, so a trip can be planned to the place they actually mean.

## Requirements

### Requirement: Live place suggestions
While the rider types a non-empty query, the destination-search screen SHALL show place suggestions from Google Maps place search. Each suggestion row SHALL follow the standard Google Maps search presentation: an icon on the left, the place name or street address as a bold primary line, and the locality or remaining address as a muted secondary line, with rows separated by thin dividers. The icon SHALL show what kind of place the suggestion is: a subway, train, bus, or ferry icon for a transit station or stop, and a location pin for any other place.

Alongside Google's suggestions, the screen SHALL search the app's own transit stops by name. Matching stops (see "Transit stop suggestions show their lines") SHALL be listed first, up to three, followed by Google's suggestions in Google's order. A Google suggestion for a transit station with the same name as a listed stop SHALL be left out. If the stop search fails or hasn't answered when Google's suggestions arrive, Google's suggestions SHALL be shown on their own, and stops arriving later SHALL be added above them without reordering Google's rows. The screen SHALL wait until the rider pauses typing before it requests suggestions. It SHALL ignore responses for queries that are no longer current, and it SHALL NOT send a request for an empty or whitespace-only query.

#### Scenario: Rider types a real address
- **WHEN** the rider types "100 Nicolls Rd" and pauses
- **THEN** the results list shows matching Google places, each with a pin icon, a bold name line, and an address line

#### Scenario: Rider keeps typing
- **WHEN** the rider types several characters in quick succession
- **THEN** only the query current after the pause is requested, and suggestions for earlier partial queries never replace newer ones

#### Scenario: Rider clears the query
- **WHEN** the rider clears the search field
- **THEN** no request is sent and the list returns to the "Recent" entries

#### Scenario: Station results are recognizable
- **WHEN** the rider types "jamaica" and pauses
- **THEN** Jamaica's stations are listed first with their mode icons and line badges, followed by Google's places with pins, and no station is listed twice

#### Scenario: Stop search is unavailable
- **WHEN** the app's stop search fails
- **THEN** Google's suggestions are shown as before, with no error for the missing stops

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
Selecting a suggestion SHALL resolve that place's display name, formatted address, and coordinates before it opens Route Results. A transit-stop suggestion from the app's own data is already resolved: selecting it SHALL open Route Results to the stop's name and coordinates at once, without a place-details request. While the place is resolving, the selected row SHALL indicate progress and further selections SHALL be ignored. If resolution fails, the rider SHALL stay on the search screen and see an error message.

#### Scenario: Rider picks a suggestion
- **WHEN** the rider selects a suggestion
- **THEN** Route Results opens with that place's display name as the destination

#### Scenario: Place details fail to load
- **WHEN** the rider selects a suggestion and its details cannot be retrieved
- **THEN** the rider remains on the search screen with an error message and can select again

#### Scenario: Rider picks a transit stop
- **WHEN** the rider selects the "Stony Brook" LIRR station suggestion
- **THEN** Route Results opens to Stony Brook station at once, and no place-details request is sent

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

### Requirement: Transit stop suggestions show their lines
For a query of at least two characters, the app SHALL search its own transit stops (every agency whose timetable it has) by name, case- and punctuation-insensitively. A station made up of several platform or direction stops SHALL appear once. Each stop suggestion SHALL show:
- an icon for its mode (subway, bus, or train);
- the stop's name as the primary line;
- the route badges of the lines serving it, in each line's color and mode shape, ordered as the agency lists them, with at most six badges followed by "+N" for the rest;
- what it is, as a muted secondary line: "LIRR station", "Subway station", or "Bus stop" with its agency (for example "Bus stop · Suffolk County Transit").

A Google suggestion for a station or stop SHALL also show the lines serving it, taken from the matching stop in the app's own data (same mode, and the same name once words like "Station" are set aside, or one name beginning with the other). A station complex made of several neighboring stations SHALL show all their lines. A Google station with no matching stop keeps its address line and shows no badges.

Stops SHALL be ranked by how well the name matches the query (the whole name, then the start of a word, then anywhere), then by distance from the rider when their location is known.

#### Scenario: Rider searches a bus stop
- **WHEN** the rider types "nicolls rd"
- **THEN** stops on Nicolls Rd appear with a bus icon and badges for the Suffolk County Transit routes serving each one

#### Scenario: Google's own station row shows its lines
- **WHEN** Google suggests "Sutphin Blvd-Archer Av-JFK Airport" as a subway station
- **THEN** its row shows the subway icon and E, J, and Z badges under the name

#### Scenario: Station complex
- **WHEN** Google suggests "Times Square-42nd Street"
- **THEN** its row shows every line that stops in the Times Sq-42 St complex

#### Scenario: Busy station
- **WHEN** a matching station is served by nine lines
- **THEN** its row shows six badges and "+3"

#### Scenario: Two stations with the same name
- **WHEN** the rider types a name shared by stations in different places, and their location is known
- **THEN** the station nearer the rider is listed first, and each row's secondary line tells them apart

### Requirement: Matching recent searches lead while typing
While the rider types, recent searches whose name or address matches every typed word (each word starting a word of the place) SHALL appear first, up to three, before the stop and place suggestions, and SHALL not appear again among them. They SHALL show while suggestions are still loading. A recent search for a transit stop SHALL keep its mode icon and lines and say "Recent" in its secondary line; other recent searches show the clock icon.

#### Scenario: Rider retypes a recent destination
- **WHEN** the rider, who recently searched Jamaica's LIRR station, types "jamaica"
- **THEN** Jamaica (marked "Recent · LIRR station") is the first row, followed by other stops and places, with Jamaica listed only once

#### Scenario: No match among recents
- **WHEN** the rider types "sutphin"
- **THEN** no recent searches appear above the suggestions
