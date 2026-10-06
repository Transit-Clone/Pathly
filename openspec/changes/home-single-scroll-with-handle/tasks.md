# Tasks

## 1. Single-scroll home with handle

- [x] 1.1 Fix the `mapHeight` use-before-declaration crash in `mobile/src/components/HomeScreen.tsx`, set `VISIBLE_TRANSIT_CARDS` back to 3, and remove the unused `useNativeDriver` import. Verify the home screen renders in App tests and `npm run lint` shows no warnings.
- [x] 1.2 In `mobile/src/components/TransitSheet.tsx`, set `pointerEvents: 'box-none'` on the scroll view's content container so the uncovered map receives drags. Verify with `npm test`.
- [x] 1.3 Add the `transit-sheet-handle` above the tabs with tap-to-toggle between the resting and expanded scroll offsets (offset tracked by a `scrollY` listener), and restore the `minHeight` on tab content. Verify that "keeps the transit list scrolling natural, with a drag handle…" and "pins and unpins routes in the Nearby list" pass.
- [x] 1.4 Update the two structural assertions in `mobile/__tests__/App.test.tsx` to their single-scroll equivalents (map window height; no filler sizing). Verify `npm run typecheck`, `npm run lint`, and `npm test` pass.
- [x] 1.5 Fix the second handle tap so it always resets to the initial resting position (tap at rest expands, any other tap collapses, and the tap records its target offset). Do not pad the sheet taller. Verify with the App test "expands the transit menu on the first handle tap and resets it on the second".

## 2. Integration check

- [ ] 2.1 On web while signed in, confirm three cards and the handle are visible at rest, tapping the handle twice expands and then returns the menu to its initial height, the page scrolls over a stationary map, dragging the uncovered map pans it, and the location button fades as the page scrolls.
