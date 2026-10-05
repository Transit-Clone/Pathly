import type { LirrBranchLiveData } from './lirrLive';
import type { RouteDetail, RoutePrediction, TransitDirection } from './transit';

/**
 * Overlays live departure predictions onto whichever route `live` is for, using the route's
 * own `liveSource` (route_id/stop_id + which `directions` index is GTFS direction_id 1) to
 * know how to map GTFS directions onto this route's own direction labels. Generalized rather
 * than hardcoded to the Port Jefferson Branch so other LIRR branches can reuse this later —
 * each just needs its own `liveSource` in transit.ts. Routes without a `liveSource`, or a
 * `live` payload for a different route than this one, are returned unchanged.
 */
export function applyLirrLive(route: RouteDetail, live: LirrBranchLiveData | null): RouteDetail {
  if (!route.liveSource || !live || live.routeId !== route.liveSource.routeId) return route;

  const direction1Index = route.liveSource.direction1Index;
  const direction0Index = direction1Index === 0 ? 1 : 0;

  const direction1Predictions = live.predictions.towardDirection1;
  const direction0Predictions = live.predictions.towardDirection0;
  const direction1First = direction1Predictions[0];
  const direction0First = direction0Predictions[0];

  const predictionsByIndex: (readonly RoutePrediction[] | undefined)[] = [undefined, undefined];
  predictionsByIndex[direction1Index] = direction1Predictions.length > 0 ? direction1Predictions : undefined;
  predictionsByIndex[direction0Index] = direction0Predictions.length > 0 ? direction0Predictions : undefined;

  const directions = [...route.directions] as [TransitDirection, TransitDirection];
  if (direction1First) directions[direction1Index] = { ...directions[direction1Index], minutes: direction1First.minutes, live: direction1First.live };
  if (direction0First) directions[direction0Index] = { ...directions[direction0Index], minutes: direction0First.minutes, live: direction0First.live };

  return {
    ...route,
    predictions: predictionsByIndex[0] ?? route.predictions,
    reversePredictions: predictionsByIndex[1],
    directions,
  };
}
