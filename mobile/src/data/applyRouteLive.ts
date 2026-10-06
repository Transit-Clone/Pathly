import type { RouteLiveStatus } from './TransitLiveContext';
import type { RouteDetail, RoutePrediction, TransitDirection } from './transit';

/**
 * Overlays live departure predictions onto whichever route `liveStatus` is for, using the
 * route's own `liveSource` (which `directions` index is GTFS direction_id 1) to know how to
 * map GTFS directions onto this route's own direction labels. Agency-agnostic — works the same
 * for LIRR and subway routes alike, since `fetchRouteLiveData` already normalizes both into
 * the same `RouteLiveData` shape.
 *
 * Routes without a `liveSource` are returned unchanged (they're always static). Routes *with*
 * one get a `liveStatus` field the UI should check before showing any prediction: while
 * loading or on a failed fetch, `predictions`/`reversePredictions` are cleared to empty rather
 * than left at whatever placeholder values live in transit.ts — showing nothing is honest;
 * showing a specific but fake number isn't.
 */
export function applyRouteLive(route: RouteDetail, liveStatus: RouteLiveStatus): RouteDetail {
  if (!route.liveSource) return route;

  if (liveStatus.status !== 'loaded' || liveStatus.data.routeId !== route.liveSource.routeId) {
    return {
      ...route,
      liveStatus: liveStatus.status === 'loaded' ? 'error' : liveStatus.status,
      // Empty, not undefined — an empty array is still truthy, so predictionsForDirection's
      // `if (route.reversePredictions)` check correctly treats "no live data" as "show
      // nothing" rather than falling through to its synthetic-estimate fallback, which only
      // exists for routes with no `liveSource` at all.
      predictions: [],
      reversePredictions: [],
      directions: route.directions.map((direction) => ({ ...direction, unavailable: true })) as [TransitDirection, TransitDirection],
    };
  }

  const live = liveStatus.data;
  const direction1Index = route.liveSource.direction1Index;
  const direction0Index = direction1Index === 0 ? 1 : 0;

  const direction1Predictions = live.predictions.towardDirection1;
  const direction0Predictions = live.predictions.towardDirection0;
  const direction1First = direction1Predictions[0];
  const direction0First = direction0Predictions[0];

  const predictionsByIndex: [readonly RoutePrediction[], readonly RoutePrediction[]] = [[], []];
  predictionsByIndex[direction1Index] = direction1Predictions;
  predictionsByIndex[direction0Index] = direction0Predictions;

  // Whichever stop on this route is actually nearest the rider right now, not the route's
  // hand-picked fallback station — absent (keeping the fallback name, and no stopId) if it
  // couldn't be resolved this cycle. Applied per direction, independently: the two directions
  // are never assumed to share a station (see nearestRouteStop.ts), so one resolving doesn't
  // require the other to.
  const direction1Override = liveStatus.nearestStop?.direction1
    ? { stopName: liveStatus.nearestStop.direction1.name, stopId: liveStatus.nearestStop.direction1.stopId }
    : {};
  const direction0Override = liveStatus.nearestStop?.direction0
    ? { stopName: liveStatus.nearestStop.direction0.name, stopId: liveStatus.nearestStop.direction0.stopId }
    : {};

  const directions = [...route.directions] as [TransitDirection, TransitDirection];
  directions[direction1Index] = direction1First
    ? { ...directions[direction1Index], ...direction1Override, minutes: direction1First.minutes, live: direction1First.live, unavailable: false }
    : { ...directions[direction1Index], ...direction1Override, unavailable: true };
  directions[direction0Index] = direction0First
    ? { ...directions[direction0Index], ...direction0Override, minutes: direction0First.minutes, live: direction0First.live, unavailable: false }
    : { ...directions[direction0Index], ...direction0Override, unavailable: true };

  return {
    ...route,
    liveStatus: 'loaded',
    predictions: predictionsByIndex[0],
    reversePredictions: predictionsByIndex[1],
    directions,
  };
}
