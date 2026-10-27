# Pathly brand guide

The rules every screen follows, so Pathly reads as one app. The values live in code; this page says
which to reach for.

## Color (`src/theme/colors.ts`)

| Role | Token | Use it for |
|---|---|---|
| Brand blue | `primary` | Main buttons, selected tabs and toggles, links, the mascot, the search pin |
| Warm accent | `highlight` | Delight only: saved stars, arrival, Support |
| Rider's location | `location` | The GPS dot and heading beam, on every map and theme |
| Route colors | `useRouteColor()` | Transit lines only, never for app chrome |
| Alerts | `alertYellow`, `red` | Service disruptions and errors |

Never introduce a one-off hex in a component: add a token, with a light and a dark value.

## Shape (`src/theme/shape.ts`)

| Token | Radius | Use it for |
|---|---|---|
| `radii.control` | 12 | Inputs, rows and segments inside a card |
| `radii.card` | 20 | Cards, panels, tiles, dialogs |
| `radii.sheet` | 24 | The top corners of bottom sheets |
| `radii.pill` | full | Buttons, chips, search bars |

Dots and round icon buttons use half their size.

## Type (`src/theme/typography.ts`)

Nunito throughout. Use the `typography` presets (`screenHeading`, `sectionHeading`, `routeName`,
`body`, `metadata`, `label`) before setting sizes by hand. Weights: 400 body, 700 emphasis,
800 headings and badges, 900 only for the big route name over the Route View map.

## Icons (`src/components/Icon.tsx`)

Filled by default. An outlined icon means "off" (an unselected toggle, an unsaved place), never just
a style choice.

## Transit badges (`src/components/RouteBadge.tsx`)

- **MTA subway:** the official round sign (diamond for express), in the line's color.
- **Everything else (bus, LIRR, ferry):** the same rounded text badge with the route's short code.
  In Route View, these show as large text in the route color over the map's corner glow.

## The mascot (`src/components/Mascot.tsx`)

Pathly appears wherever the app talks to the rider rather than shows data:

| Pose | When |
|---|---|
| `happy` | Sign-in, favorites, Support, the search pin on the map |
| `thinking` | Loading, nothing found yet |
| `worried` | Live data or GPS trouble, errors |
| `sleepy` | Empty lists (no recent trips, no saved places) |
| `celebrate` | Arrival |

Keep it small (40–76 pt) and never put it over route colors.
