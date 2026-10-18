import type { Itinerary, TransitStep, TripDeparture, TripStep } from './tripPlanning';

/**
 * Picking another departure for a leg of a planned trip (the departure box on each leg). The
 * backend lists each matched leg's scheduled departures between the same two stops; choosing one
 * re-times that leg, and every later leg moves to the first departure it can then make: later when
 * the connection is missed, earlier when an earlier pick frees one up.
 */

/** A rider's picks: transit leg index (0-based, transit legs only) -> the chosen `departs`. */
export type DepartureChoices = ReadonlyMap<number, string>;

/** A departure as the leg's box offers it. */
export type LegDepartureOption = TripDeparture & { selected: boolean; reachable: boolean };

/** Departures within this of each other are the same one. */
const SAME_DEPARTURE_MS = 60_000;
/** The least time to change vehicles at the same stop, when a moved connection is re-picked. */
const TRANSFER_BUFFER_MS = 60_000;

const ms = (iso: string) => Date.parse(iso);

function plannedDeparture(step: TransitStep): TripDeparture {
  return { departs: step.from.time, arrives: step.to.time, ...(step.stops ? { stopTimes: step.stops.map((stop) => stop.time) } : {}) };
}

/** Every departure the leg could take, the planned one included, in time order. */
function departuresOf(step: TransitStep): TripDeparture[] {
  const listed = step.departures ?? [];
  const planned = plannedDeparture(step);
  const all = listed.some((option) => Math.abs(ms(option.departs) - ms(planned.departs)) < SAME_DEPARTURE_MS) ? listed : [...listed, planned];
  return [...all].sort((a, b) => ms(a.departs) - ms(b.departs));
}

function retimeStep(step: TransitStep, option: TripDeparture): TransitStep {
  const shift = ms(option.departs) - ms(step.from.time);
  return {
    ...step,
    from: { ...step.from, time: option.departs },
    to: { ...step.to, time: option.arrives },
    durationSeconds: Math.max(0, (ms(option.arrives) - ms(option.departs)) / 1000),
    ...(step.stops ? {
      stops: step.stops.map((stop, index) => ({
        ...stop,
        // The same stops in between have their own times; otherwise they move with the departure.
        time: option.stopTimes?.[index] ?? new Date(ms(stop.time) + shift).toISOString(),
      })),
    } : {}),
  };
}

/** Seconds walking right before each transit leg, by transit leg index. */
function walksBefore(steps: readonly TripStep[]): number[] {
  const walks: number[] = [];
  let pending = 0;
  for (const step of steps) {
    if (step.kind === 'walk') pending += step.durationSeconds;
    else {
      walks.push(pending);
      pending = 0;
    }
  }
  return walks;
}

type Retimed = { itinerary: Itinerary; earliest: number[] };

function retime(itinerary: Itinerary, choices: DepartureChoices, nowMs: number): Retimed {
  const walks = walksBefore(itinerary.steps);
  const earliest: number[] = [];
  let legIndex = 0;
  let previousArrival: number | null = null;
  // Whether an earlier leg runs at other times than planned; until one does, the plan's own
  // connections stand.
  let shifted = false;
  const steps = itinerary.steps.map((step): TripStep => {
    if (step.kind !== 'transit') return step;
    const index = legIndex;
    legIndex += 1;
    const walkMs = (walks[index] ?? 0) * 1000;
    // The first leg can be caught after walking from now; later ones after the previous arrival.
    const canMake = previousArrival === null ? nowMs + walkMs : previousArrival + walkMs;
    earliest.push(canMake);
    const options = departuresOf(step);
    const chosen = choices.get(index);
    const picked = chosen !== undefined ? options.find((option) => option.departs === chosen && ms(option.departs) >= canMake) : undefined;
    let option = picked;
    if (!option) {
      const planned = plannedDeparture(step);
      // The first leg keeps its planned time unless the rider picks another. A later leg after a
      // moved one takes the first departure it can make (with time to change when there's no
      // walk), earlier or later than planned; after unmoved legs, the plan's connection stands.
      const firstMakeable = (from: number) => options.find((candidate) => ms(candidate.departs) >= from);
      option = previousArrival === null
        ? planned
        : shifted
          ? firstMakeable(canMake + (walkMs > 0 ? 0 : TRANSFER_BUFFER_MS)) ?? firstMakeable(canMake) ?? planned
          : ms(planned.departs) >= canMake ? planned : firstMakeable(canMake) ?? planned;
    }
    const retimed = option.departs === step.from.time && option.arrives === step.to.time ? step : retimeStep(step, option);
    if (retimed !== step) shifted = true;
    previousArrival = ms(retimed.to.time);
    return retimed;
  });

  const original = itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit');
  const updated = steps.filter((step): step is TransitStep => step.kind === 'transit');
  const first = original[0];
  const last = original.at(-1);
  if (!first || !last) return { itinerary, earliest };
  const departureTime = new Date(ms(itinerary.departureTime) + ms(updated[0]!.from.time) - ms(first.from.time)).toISOString();
  const arrivalTime = new Date(ms(itinerary.arrivalTime) + ms(updated.at(-1)!.to.time) - ms(last.to.time)).toISOString();
  return {
    itinerary: { ...itinerary, steps, departureTime, arrivalTime, durationSeconds: Math.max(0, (ms(arrivalTime) - ms(departureTime)) / 1000) },
    earliest,
  };
}

/** The trip with the rider's picked departures, later legs moved to connections they can make. */
export function retimeItinerary(itinerary: Itinerary, choices: DepartureChoices, nowMs: number): Itinerary {
  return choices.size === 0 ? itinerary : retime(itinerary, choices, nowMs).itinerary;
}

/**
 * Each transit leg's departures for its box (an empty list for a leg with no others to pick):
 * which one the trip takes, and whether it can still be made.
 */
export function legDepartureOptions(itinerary: Itinerary, choices: DepartureChoices, nowMs: number): LegDepartureOption[][] {
  const { itinerary: retimed, earliest } = retime(itinerary, choices, nowMs);
  const original = itinerary.steps.filter((step): step is TransitStep => step.kind === 'transit');
  const updated = retimed.steps.filter((step): step is TransitStep => step.kind === 'transit');
  return original.map((step, index) => {
    if (!step.departures || step.departures.length < 2) return [];
    const taken = ms(updated[index]!.from.time);
    return departuresOf(step).map((option) => ({
      ...option,
      selected: Math.abs(ms(option.departs) - taken) < SAME_DEPARTURE_MS,
      reachable: ms(option.departs) >= (earliest[index] ?? 0),
    }));
  });
}

/**
 * The few departures the box shows before "All departures": the one taken and the next ones the
 * rider can make, up to `count`.
 */
export function quickDepartureOptions(options: readonly LegDepartureOption[], count = 3): LegDepartureOption[] {
  const selectedIndex = options.findIndex((option) => option.selected);
  const firstReachable = options.findIndex((option) => option.reachable);
  const start = selectedIndex >= 0 && (firstReachable < 0 || selectedIndex < firstReachable) ? selectedIndex : Math.max(0, firstReachable);
  const shown = options.slice(start).filter((option) => option.reachable || option.selected).slice(0, count);
  const selected = options[selectedIndex];
  // The taken departure is always among them, even when it's later than the first few.
  if (selected && !shown.includes(selected)) shown.splice(count - 1, 1, selected);
  return shown;
}
