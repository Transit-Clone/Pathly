# Spec Delta

## ADDED Requirements

### Requirement: Transit stop suggestions show their lines
For a query of at least two characters, the app SHALL search its own transit stops (every agency whose timetable it has) by name, case- and punctuation-insensitively. A station made up of several platform or direction stops SHALL appear once. Each stop suggestion SHALL show:
- an icon for its mode (subway, bus, or train);
- the stop's name as the primary line;
- the route badges of the lines serving it, in each line's color and mode shape, ordered as the agency lists them, with at most six badges followed by "+N" for the rest;
- the agency or area as a muted secondary line (for example "LIRR" or "Suffolk County Transit").

Stops SHALL be ranked by how well the name matches the query (the whole name, then the start of a word, then anywhere), then by distance from the rider when their location is known.

#### Scenario: Rider searches a bus stop
- **WHEN** the rider types "nicolls rd"
- **THEN** stops on Nicolls Rd appear with a bus icon and badges for the Suffolk County Transit routes serving each one

#### Scenario: Busy station
- **WHEN** a matching station is served by nine lines
- **THEN** its row shows six badges and "+3"

#### Scenario: Two stations with the same name
- **WHEN** the rider types a name shared by stations in different places, and their location is known
- **THEN** the station nearer the rider is listed first, and each row's secondary line tells them apart

## MODIFIED Requirements

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
