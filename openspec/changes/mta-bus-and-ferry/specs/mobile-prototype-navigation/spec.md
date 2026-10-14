# Spec Delta

## ADDED Requirements

### Requirement: City buses and NYC Ferry are covered
In addition to the subway, LIRR, NICE, and Suffolk County Transit, the app SHALL cover NYC Transit's Bronx, Brooklyn, Manhattan, Queens, and Staten Island buses, MTA Bus Company, and NYC Ferry, each from its operator's official schedule data. Their routes SHALL appear in Nearby, open route detail and departures pages, and take part in every feature built on the app's timetables (such as trip stop lists and stop search), in the same way as the existing agencies.

Live predictions and vehicle positions SHALL come from MTA Bus Time for buses, and live predictions from NYC Ferry's real-time feed for ferries. NYC Ferry publishes no vehicle positions, so ferry routes SHALL show predictions without live vehicles. When a live source is unconfigured or unavailable, these routes SHALL fall back to scheduled times, marked as untracked, as the existing agencies do.

A bus's badge SHALL show its full route name, including any SBS or express designation (for example "SIM3C" or "M15-SBS").

#### Scenario: Rider near a city bus stop
- **WHEN** the rider is near a Manhattan stop served by the M15 and M15-SBS
- **THEN** both routes appear in Nearby with their upcoming departures and open their route detail pages

#### Scenario: Ferry route without live boats
- **WHEN** the rider opens an NYC Ferry route
- **THEN** its departures show live predictions when the ferry feed has them, and the map shows the route and its landings without vehicle markers

#### Scenario: Bus Time is not configured
- **WHEN** the backend has no MTA Bus Time key
- **THEN** city bus routes still appear and show their scheduled departures as untracked, and no technical error is shown

### Requirement: Ferry is a trip mode
Route Results SHALL recognize ferry legs from the routing service as a ferry mode, not as an unknown vehicle. Ferry legs SHALL be priced with NYC Ferry's published single-ride fare. The Modes control SHALL offer Ferry alongside Subway, Bus, and LIRR; excluding Ferry SHALL hide any itinerary with a ferry leg.

#### Scenario: Trip with a ferry leg
- **WHEN** an itinerary rides NYC Ferry from Wall St/Pier 11 to East 34th St
- **THEN** its card shows a ferry badge for that leg and includes the ferry fare in the trip fare

#### Scenario: Rider excludes ferries
- **WHEN** the rider excludes Ferry in Modes
- **THEN** itineraries with a ferry leg are hidden
