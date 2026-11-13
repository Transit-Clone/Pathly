# Route navigation design and accessibility audit

Date: November 12, 2026. Baseline: `82d5f0f`, branch `codex/mobile-release-polish`.

## Evidence boundary

This is an independent source/design review with review of four current-baseline Chrome phone-width screenshots captured by the coordinating agent. No browser or simulator was driven by this reviewer, no account/settings were changed, and no product code was edited. Findings below explicitly distinguish screenshot-observed conditions from source-backed risks and native verification still required. These notes do not certify native accessibility or release readiness.

## Existing design to preserve

- Pathly already has a coherent blue/white (and dark) transit identity, Nunito type hierarchy, agency-specific signs, rounded sheets, consistent floating map controls, and expressive but bounded mascot use. A redesign or generic replacement UI would add release risk without addressing rider tasks.
- Planned trip details correctly group only the read-only leg header for screen readers, leaving departure/stop controls separately operable (`SharedTripDetailView.tsx:535–543`). Expanded-state labels already exist for service notices, full departures, and intermediate stops.
- Stop selection in the line-based Ride Guide is appropriate: Route View GO starts without a planned destination (`RideGuideView.tsx:32–36`). Do not remove that picker because a destination-planned trip already knows its exit.
- Critical map controls have labels and selected state. They are consistently 46 logical points across screens (`MapControlButton.tsx:37–56,62`); this meets the usual iOS 44-point target floor but is slightly below Android's 48dp recommendation.
- Light muted body metadata (`#657386`) on white has a calculated 4.83:1 contrast ratio. There is no evidence supporting a blanket palette replacement.

## Prioritized findings and candidate fixes

### VIS-01 — P1 confirmed on web: sticky End action covers the current instruction

**Follow-up status:** Fixed in the working tree and visually rechecked on Chrome at 320px with app Large text (right- and left-handed layouts), and at 390px in light/dark themes. See the after-review section below. Native verification remains open.

**Source-confirmed:** Active navigation supplies its red END pill to `DetailMapPage` without overriding `actionSticks` (`EnrouteNavigationView.tsx:207–224`). The layout defaults `actionSticks=true` and clamps that action below the fixed controls as the sheet scrolls (`DetailMapPage.tsx:64,114–123,184–187`). Its z-index 12 sits above the sheet/header (`DetailMapPage.tsx:232–233`). Guidance begins only 22 points below the sheet edge, and the phase/arrival row reserves no area for a floating action (`EnrouteNavigationView.tsx:445,460–463`).

**Observed:** `evidence/navigation-scrolled-390-before.jpg` shows the red END pill directly covering part of **Board LIRR at Stony Brook**, the main current instruction. `evidence/navigation-expanded-390-before.jpg` shows the same action safely on the map before further scrolling. This establishes a current-baseline web overlap, not merely a potential metadata collision. Native rendering of the same geometry remains to be checked.

**Reproduction requested:** Start a trip, expand/scroll active navigation until the guidance card reaches the top. Check 320px and normal phone widths, Large/easy text, both thumb-side choices, and at least one native surface. Capture the action and arrival/current-action bounds.

**Preferred bounded fix:** Allocate END a fixed top-bar slot between Back and voice (or within a reserved trailing group), and remove the floating `action` prop from active navigation. Reserve the actual control-row height in `DetailMapPage`, keep the existing confirmation dialog and accessible label, and allow intrinsic/minimum height for enlarged text. This preserves immediate cancellation without altering the shared sticky-action algorithm or other screens. Check 320px, large text, both thumb sides, and native safe areas.

**Alternative:** `actionSticks={false}` is the smallest one-line layout change and already matches shared trip details. It fixes occlusion by letting END scroll away with the map, but cancellation then requires returning to that map/top position. It is a reasonable fallback if a header slot cannot be validated, but is weaker for always-reachable cancellation. Do not solve the overlap by adding arbitrary padding only to the first guidance card: the floating action can cover later content as scrolling continues.

### VIS-02 — P1 accessibility candidate: active guidance groups interactive descendants

**Follow-up status:** The coordinator changed the markup so the combined read-only directions remain grouped while sharing/report controls and location notices sit outside that accessible element. Source structure now addresses the identified nesting risk. Actual VoiceOver/TalkBack traversal remains unverified; screenshots cannot close that check.

**Source-confirmed:** `EnrouteNavigationView.tsx:253–257` marks the entire guidance card `accessible=true` with one synthesized label. That same card contains the ride-sharing dismissal button (`301–313`) and `RideReportBar` (`316–319`). The card ends at line327. The parent label covers core directions/time but does not describe those nested controls or location-warning copy.

**Why this matters:** React Native's documentation explicitly notes that VoiceOver disallows nested accessibility elements and TalkBack can choose a parent instead. Thus accessible parent grouping can make those controls/status messages unreachable or reduce their clarity. This is a platform-backed risk, not an observed VoiceOver/TalkBack result.

**Verification requested:** In a simulated riding/sharing state, traverse the screen with VoiceOver/TalkBack or an accessibility inspector. Verify that Not on this, report choices, and live location warnings remain separately reachable and meaningfully announced.

**Bounded fix:** Group only the read-only instruction/header/next-step area. Leave notices and interactive sharing/report controls outside the grouped element, following the existing trip-detail header approach. Small effort; low–medium risk. Keep a concise combined instruction label without hiding recovery actions.

Reference: [React Native accessibility](https://reactnative.dev/docs/accessibility#accessible).

### VIS-03 — P2: several route-selection targets are below mobile recommendations

**Source-confirmed:** `PressableScale` passes through caller styles and adds no minimum target size or default hit slop (`PressableScale.tsx:18–20,44–58`). Current targets without explicit hit slop include:

| Screen/control | Source | Styled size |
| --- | --- | --- |
| Results Modes/Filters/Leave time | `RouteResultsView.tsx:395–428,607` | Fixed height 36 |
| Swap origin/destination | `RouteResultsView.tsx:331–338,621` | 38 × 38 |
| Quick departure chips/More | `SharedTripDetailView.tsx:169–185,570–580,761` | Min height 34 |
| Full departure rows | `SharedTripDetailView.tsx:594–615,766` | Min height 40 |
| Intermediate-stops toggle | `SharedTripDetailView.tsx:632–643,770` | Min height 32 |
| Expanded intermediate-stop rows | `SharedTripDetailView.tsx:648–663,772` | Min height 34 |

**Impact:** These are frequent, sometimes adjacent travel decisions on a moving vehicle. They are harder to hit with one hand, tremor, or low vision. Source dimensions do not alone establish all effective native hit bounds; measure runtime before claiming every target fails an accessibility scan.

**Screenshot context:** `evidence/route-results-390-before.jpg` confirms a coherent but compact Modes/Filters/Leave now toolbar. The freshness label and departure/schedule lines are visibly small relative to the duration totals. Raising critical schedule readability and target size is a focused improvement; the screenshot does not support replacing the whole card system or enlarging every secondary label indiscriminately.

**Bounded fix:** Prefer explicit minimum heights of 44/48 and adequate spacing on these controls, allowing intrinsic growth with text. Use limited hit slop only where targets do not overlap. Small effort; low–medium layout risk. Recheck density, map/sheet balance, large fonts, and scrolling. A minimum-height change should not turn the toolbar into a large redesign.

Reference: [Android touch target guidance](https://support.google.com/accessibility/android/answer/7101858?hl=en) recommends at least 48dp in each dimension and adequate separation.

### VIS-04 — P2 conditional contrast defect: selected departure label can be white on a light route

**Source-confirmed conditional case:** `DepartureChip` uses the route color as selected fill, and defaults selected text/live signal to `#FFFFFF` if the optional `textColor` is absent (`SharedTripDetailView.tsx:179–184`). For a valid yellow MTA line color `#FCCC0A`, the computed white contrast is 1.52:1. A black label gives 13.78:1. `RouteBadge` already uses black for light subway colors even when a feed says otherwise (`RouteBadge.tsx:105–128`), so the badge and a selected departure can disagree on the same screen.

**Scope/confidence:** The style fallback defect is deterministic for a valid model lacking textColor. It has not yet been reproduced from the current live timetable feed; feeds may supply black textColor. Do not claim that all yellow-line trips are currently unreadable.

**Verification requested:** Inspect a yellow N/Q/R/W trip's selected departure, or a controlled component fixture with that color and no textColor. Check the label and live indicator in light/dark/high-contrast themes.

**Bounded fix:** Use a shared contrast-aware foreground fallback for selected route-colored controls, retaining explicit provider textColor where appropriate. Small effort; low risk if scoped to selected departure labels/signals. Do not replace agency colors or globally darken badges.

Reference: [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) specifies 4.5:1 for ordinary text and 3:1 for large text.

### VIS-05 — P2: long countdown formatting is inconsistent; large-text header still needs verification

**Follow-up status:** The reviewed after captures use compact hour/minute countdowns and wrap the phase/arrival row at 320px with app Large text. This resolves the observed formatting inconsistency and confirms a useful narrow-layout improvement on the tested browser surface. Native OS font scaling remains a separate check.

**Source-confirmed:** Active navigation's phase and full arrival summary share one horizontal row with no flexWrap or shrink constraints (`EnrouteNavigationView.tsx:259–262,461–463`). The text is scaled by app Large 1.15/easy 1.25 and by native OS font scaling. Other trip screens conditionally stack metrics at OS fontScale 1.5 (`SharedTripDetailView.tsx:369–371`; `RouteResultsView.tsx:167–169`), but the active header has no corresponding adaptation.

**Observed formatting issue:** `evidence/navigation-expanded-390-before.jpg` shows `Arrive 1:31 AM · in224 min` and `Departs 11:38 PM · in111 min`; the scrolled capture shows the departure countdown at 110 min. The trip-detail screenshot already renders the same journey's total as `1hr 53m`. Compact hour/minute formatting would make long waits clearer and reduce active-header pressure without changing travel estimates.

**Remaining layout verification:** A long phase such as WAITING TO BOARD plus the arrival summary can collide or escape the card on a smaller phone or at increased text scale. The 390px default-text capture fits this row; overflow at 320px/large text must be established separately before being called reproduced.

**Bounded fix:** Wrap or stack the phase/arrival row based on available width/effective text scaling; retain the current action as the dominant element. Reuse hour/minute formatting for long countdowns. Small–medium effort; low risk if actual expected strings and semantic accessibility labels are preserved.

## Additional targeted checks, not confirmed bugs

- Large app text combined with OS font scaling: the stack threshold only checks OS fontScale, while theme typography multiplies it independently (`AppSettings.tsx:15–18,145–166,224–258`). Test combinations around the stacking threshold, not only OS default and maximum.
- Departure list/lines sheets use fixed bottom padding 30 and a raw animated SheetPanel, without explicit safe-area handling. Check home indicator/Android gesture-nav clearance and focus restoration; source alone is insufficient to call this broken.
- Recovery and confirmation cards lack a bounded scrolling container. Check long destination/error copy at large fonts on the smallest supported phone before changing a shared modal.
- Results' tiny freshness labels (9pt) and schedule labels (10pt) deserve a glanceability check. They carry useful timing/state, but changing them should be driven by live screenshots and hierarchy rather than indiscriminately enlarging every label.
- The functional reviewer verified that React Native Web's PressResponder stops click propagation before invoking its onPress handler. Nested fare buttons are therefore not a demonstrated web bubbling bug. A native interaction check is still appropriate, but should not become a finding from nesting alone.

## Recommended first fix batch after runtime confirmation

1. Prevent the sticky END action from obscuring active guidance.
2. Make active-trip phase/arrival metadata wrap cleanly and format long countdowns compactly.
3. Improve route/departure touch sizes without changing the screen's identity.
4. Move interactive ride/report controls outside the grouped guidance accessibility element.
5. Apply a contrast-aware selected-departure fallback if fixture or live-feed confirmation establishes the case.

## Runtime evidence reviewed and still needed

Reviewed coordinating-agent Chrome screenshots at 390px width:

- `evidence/route-results-390-before.jpg`
- `evidence/trip-details-390-before.jpg`
- `evidence/navigation-expanded-390-before.jpg`
- `evidence/navigation-scrolled-390-before.jpg`

END occlusion and long total-minute countdowns are screenshot-observed. The results/detail layout otherwise reads consistently: route badges, fare/time totals, departure and arrival cards, and boarding/alighting timeline remain recognizable. No blanket redesign is warranted by these captures.

The subsequent after-review below covers 320px/app-Large, light/dark, and both thumb sides for active navigation. Still open are equivalent line-based Ride Guide coverage, native safe-area/scroll behavior, effective touch-target measurements, light/yellow selected-departure contrast, and native screen-reader traversal. None is implicitly passed by browser screenshots.

## After-review: active-navigation fixes

Independently reviewed these coordinating-agent captures using the image viewer:

- `evidence/navigation-large-320-before.jpg`
- `evidence/navigation-large-320-after.jpg`
- `evidence/navigation-large-scrolled-320-after.jpg`
- `evidence/navigation-large-left-320-after.jpg`
- `evidence/navigation-light-390-after.jpg`
- `evidence/navigation-dark-390-after.jpg`

### Verified improvements on the covered browser surface

- END now occupies an allocated fixed top-bar slot alongside Back and voice. It stays available while scrolling and no longer floats over the visible boarding instruction. The ordinary header still masks content that is intentionally scrolled behind it; that is distinct from a destructive pill covering a line within the visible content area.
- Right- and left-handed320px arrangements fit within the viewport in the supplied captures. The locate button moves to the selected thumb side without colliding with the guidance sheet.
- At320px with app Large text, WAITING TO BOARD and the arrival summary occupy separate clean lines instead of competing in the old single row. The main boarding instruction wraps legibly, and the countdown reads in hours/minutes.
- The 390px light and dark guidance cards have clear current/next-step hierarchy. Dark text/timing/warning presentation is legible in the captured frame. No new dark-mode contrast defect is established by these screenshots.

### Residual polish and verification boundaries

- At320px Large, departure metadata sometimes breaks the countdown across lines (`in1hr` then `30m`/`22m`). The complete value is visible; this is a P3 glanceability improvement, not a release blocker. If changing it, group the complete countdown as a wrapping unit rather than shrinking text or truncating it.
- The dark 390px map contains visibly patchy rectangular tile areas in the captured frame. This may be a transient paint/loading frame after a theme change. Recheck after tiles settle and with a repeatable reproduction before filing a map defect; the screenshot alone does not establish its cause or persistence.
- These are browser screenshots with the app's Large setting, not native OS font-scaling or physical-device evidence. Native safe areas, actual touch bounds, scroll/gesture behavior, and screen-reader traversal remain open.
- VIS-03's small-target observations and VIS-04's conditional selected-departure contrast case were not fixed or validated by the active-navigation screenshots. They remain separately scoped recommendations/verification targets.

### Scoped visual verdict

The confirmed active-navigation instruction occlusion is corrected in the reviewed web states, and narrow/large-text presentation is materially clearer without changing Pathly's identity. No remaining visual blocker is evident in those active-navigation frames. This is not a native accessibility, whole-app, or app-store release signoff. Planned-trip detail and line-based Ride Guide still need equivalent native/large-text interaction coverage, as do the remaining source-backed target/contrast candidates.
