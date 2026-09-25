# Tasks

## 1. Theme and Typography Foundation

- [x] 1.1 Add the Expo-compatible Nunito dependency and load only the required weights at the application root; verify a clean install succeeds and the app does not render its screens before fonts are ready.
- [x] 1.2 Replace the branded and semantic color tokens with the exact design-document palette while retaining compatible neutral and map tokens; verify a focused theme test asserts all six required hex values.
- [x] 1.3 Add shared named typography roles for headings, route names, display times, body text, metadata, and labels; verify the typography test enforces Nunito families and the minimum 22-pixel time and 18-pixel route-name sizes.

## 2. Shared Home and Search Presentation

- [x] 2.1 Apply the new palette and typography roles to the home shell, map backdrop, search header, location controls, and bottom sheet; verify the existing home-screen test still passes and no essential touch target is smaller than 44 logical pixels.
- [x] 2.2 Remove redundant eyebrow-and-heading combinations from the nearby-transit and destination-search sections while retaining clear single headings; update the mobile tests to verify the concise visible copy and existing search behavior.
- [x] 2.3 Restyle search inputs, results, empty states, tabs, and selected states with the new semantic tokens; verify recent results, numbered matches, cancel, clear, and tab-selection states remain visibly and accessibly distinguishable in component tests.

## 3. Nearby Transit Hierarchy

- [x] 3.1 Separate route identity accents from semantic service-status tones in transit-card props and mock data; verify tests show on-time status in success styling and planned-work status in warning styling without changing each route badge.
- [x] 3.2 Rework transit-card layout and type hierarchy so arrival times are at least 22 pixels and route names are at least 18 pixels while all current supporting details remain present; verify focused style/content tests cover every current card.
- [x] 3.3 Check the updated cards at narrow and standard Android widths and adjust spacing, timing-column width, or minimum height to prevent clipping; record successful visual checks for the longest current route, destination, and status strings.

## 4. Route Detail Hierarchy

- [x] 4.1 Apply the palette and typography roles to the Ronkonkoma route map, sheet, controls, and timeline while preserving their structure; verify the existing open-route, change-departure, and back-navigation test passes.
- [x] 4.2 Increase the route title, departure times, stop names, and stop times according to the design hierarchy and strengthen selected-departure treatment; add focused tests verifying both departure options and all stop data remain associated correctly.
- [x] 4.3 Review the route-detail screen at narrow and standard Android widths to confirm the title, departure buttons, station names, and times do not clip or overlap; record successful visual checks for both departure selections.

## 5. Integration Verification

- [x] 5.1 Run `npm run lint`, `npm test`, and `npm run typecheck`; verify every command exits successfully with all existing and new mobile checks passing.
- [x] 5.2 Run `npm run build`; verify Expo exports Android, iOS, and web bundles and the server TypeScript build remains unaffected.
- [x] 5.3 Exercise the complete existing Android prototype flow—home, tabs, search, Ronkonkoma route, departure selection, and back navigation—and verify the visual update introduces no new screens, data behavior, or product functionality.

## 6. Direction, Prediction, and Sheet Refinements

- [x] 6.1 Extend local transit mock data with two directions per route and explicit live-versus-scheduled prediction metadata; verify tests cover both provenance states and both directions.
- [x] 6.2 Redesign home route cards as icon-free, route-colored swipe pages with route name and minute count at matching display size, ordered direction/stop text, centered `minutes`, and GPS or scheduled treatment; verify contrast and content on every route.
- [x] 6.3 Make the home transit sheet vertically draggable between bounded compact and expanded positions while keeping search/profile controls fixed; verify drag clamping, snapping, and a 44-pixel handle target.
- [x] 6.4 Replace route-detail clock-time selectors with multiple square-ish minute prediction tiles, add GPS/scheduled provenance, a service-alert control, matching route/map/timeline color, and top-right location/pin controls; remove selected/next-train captions and verify local pin interaction.
- [x] 6.5 Update focused interaction tests, run lint/test/typecheck/build, and exercise direction swiping, sheet dragging, route predictions, alerts, location, pinning, and back navigation on Android while leaving the emulator open for review.
