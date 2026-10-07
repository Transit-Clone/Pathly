"""Generate mobile/src/data/stationTransfers.ts: the bus, subway, and rail lines a rider can
transfer to at each Port Jefferson Branch station.

For every Port Jefferson Branch station (LIRR route_id 10, from the LIRR static GTFS in the repo), this finds the routes of each
agency below that stop within RADIUS_M metres of the station, plus the other LIRR branches that
serve the same LIRR stop. Static GTFS feeds are downloaded fresh from each agency (a few MB each,
about 37 MB total) into a temporary directory, so re-run this whenever schedules change:

    python scripts/generate_station_transfers.py
    python scripts/generate_station_transfers.py --feeds-dir path/to/zips   # reuse downloads

Only the Python standard library is required.
"""

import argparse
import csv
import io
import math
import re
import tempfile
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIRR_DIR = ROOT / 'firebase/functions/static_data/lirr'
OUT_TS = ROOT / 'mobile/src/data/stationTransfers.ts'

# Walking-transfer distance: a ~5 minute walk, and wide enough to catch the subway entrances
# around Penn Station without pulling in Herald Square.
RADIUS_M = 400
LIRR_ROUTE_ID = '10'  # Port Jefferson Branch itself; never listed as its own transfer.
# LIRR's "City Terminal Zone" route groups intra-city service; it isn't a branch riders transfer to.
LIRR_EXCLUDED_ROUTE_NAMES = {'City Terminal Zone'}
# Maintenance yard that appears in stop_times as a timing point, not a passenger station.
NON_PASSENGER_STOPS = {'Hillside Facility'}

FEEDS = [
    # (file stem, agency label, mode, official URL)
    ('sct', 'Suffolk County Transit', 'bus', 'https://tracksctbus.org/gtfs'),
    ('nice', 'NICE Bus', 'bus', 'https://www.nicebus.com/NICE/media/nicebus-gtfs/NICE_GTFS.zip'),
    ('subway', 'NYC Subway', 'subway', 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip'),
    ('q', 'MTA Bus', 'bus', 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip'),
    ('m', 'MTA Bus', 'bus', 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip'),
    ('busco', 'MTA Bus', 'bus', 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip'),
]
MODE_ORDER = {'rail': 0, 'subway': 1, 'bus': 2}


def metres(lat1, lon1, lat2, lon2):
    dy = (lat2 - lat1) * 110_540
    dx = (lon2 - lon1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def load_stations():
    """Every stop served by the Port Jefferson Branch, in first-seen trip order."""
    stops_by_id = {row['stop_id']: row for row in read_csv(LIRR_DIR, 'stops.txt')}
    branch_trips = {row['trip_id'] for row in read_csv(LIRR_DIR, 'trips.txt') if row['route_id'] == LIRR_ROUTE_ID}
    stop_ids = []
    for row in read_csv(LIRR_DIR, 'stop_times.txt'):
        if row['trip_id'] in branch_trips and row['stop_id'] not in stop_ids:
            if stops_by_id[row['stop_id']]['stop_name'] in NON_PASSENGER_STOPS:
                continue
            stop_ids.append(row['stop_id'])
    return [
        {'name': stops_by_id[i]['stop_name'], 'stopId': i, 'lat': float(stops_by_id[i]['stop_lat']), 'lon': float(stops_by_id[i]['stop_lon'])}
        for i in stop_ids
    ]


def read_csv(source, name):
    """Rows of a GTFS table from a zip or a directory."""
    if isinstance(source, zipfile.ZipFile):
        with source.open(name) as raw:
            yield from csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig'))
    else:
        with open(source / name, encoding='utf-8-sig', newline='') as handle:
            yield from csv.DictReader(handle)


def routes_near(source, stations):
    """station name -> {route_id} for routes stopping within RADIUS_M, and the routes table."""
    near_stop = defaultdict(set)  # stop_id -> station names it is near
    for stop in read_csv(source, 'stops.txt'):
        try:
            lat, lon = float(stop['stop_lat']), float(stop['stop_lon'])
        except (KeyError, ValueError):
            continue
        for station in stations:
            if metres(station['lat'], station['lon'], lat, lon) <= RADIUS_M:
                near_stop[stop['stop_id']].add(station['name'])
    trips_at = defaultdict(set)  # station -> trip_ids
    for row in read_csv(source, 'stop_times.txt'):
        for station in near_stop.get(row['stop_id'], ()):
            trips_at[station].add(row['trip_id'])
    route_of_trip = {row['trip_id']: row['route_id'] for row in read_csv(source, 'trips.txt')}
    routes = {row['route_id']: row for row in read_csv(source, 'routes.txt')}
    by_station = {station: {route_of_trip[t] for t in trips if t in route_of_trip} for station, trips in trips_at.items()}
    return by_station, routes


def route_label(route, mode):
    name = (route.get('route_short_name') or '').strip() or (route.get('route_long_name') or '').strip()
    if mode == 'rail':
        name = re.sub(r'\s+Branch$', '', name)
    return name


def color(value):
    value = (value or '').strip().lstrip('#')
    return f'#{value.upper()}' if re.fullmatch(r'[0-9A-Fa-f]{6}', value) else None


def natural_key(text):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r'(\d+)', text)]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--feeds-dir', type=Path, help='directory with already-downloaded <stem>.zip feeds')
    args = parser.parse_args()

    stations = load_stations()
    transfers = defaultdict(dict)  # station -> key -> transfer

    def add(station, agency, mode, route):
        label = route_label(route, mode)
        if not label:
            return
        transfers[station][(agency, label)] = {
            'agency': agency,
            'mode': mode,
            'name': label,
            'color': color(route.get('route_color')),
            'textColor': color(route.get('route_text_color')),
        }

    # Other LIRR branches calling at the same station (same stop_id, not just nearby).
    lirr_routes = {row['route_id']: row for row in read_csv(LIRR_DIR, 'routes.txt')}
    lirr_route_of_trip = {row['trip_id']: row['route_id'] for row in read_csv(LIRR_DIR, 'trips.txt')}
    station_by_stop_id = {station['stopId']: station['name'] for station in stations}
    for row in read_csv(LIRR_DIR, 'stop_times.txt'):
        station = station_by_stop_id.get(row['stop_id'])
        route_id = lirr_route_of_trip.get(row['trip_id'])
        if station and route_id and route_id != LIRR_ROUTE_ID and lirr_routes[route_id]['route_long_name'] not in LIRR_EXCLUDED_ROUTE_NAMES:
            add(station, 'LIRR', 'rail', lirr_routes[route_id])

    with tempfile.TemporaryDirectory() as tmp:
        for stem, agency, mode, url in FEEDS:
            path = (args.feeds_dir / f'{stem}.zip') if args.feeds_dir else Path(tmp) / f'{stem}.zip'
            if not path.exists():
                print(f'downloading {url}')
                urllib.request.urlretrieve(url, path)
            with zipfile.ZipFile(path) as feed:
                by_station, routes = routes_near(feed, stations)
            for station, route_ids in by_station.items():
                for route_id in route_ids:
                    add(station, agency, mode, routes[route_id])

    lines = [
        '// Generated by scripts/generate_station_transfers.py; do not edit by hand. Re-run the script',
        f'// when schedules change. Lines stopping within {RADIUS_M} m of each Port Jefferson Branch station,',
        '// from the official static GTFS feeds of LIRR, Suffolk County Transit, NICE Bus, NYC Subway, and MTA Bus.',
        '',
        "export type TransferMode = 'rail' | 'subway' | 'bus';",
        '',
        'export type StationTransfer = {',
        '  agency: string;',
        '  mode: TransferMode;',
        '  name: string;',
        '  color: string | null;',
        '  textColor: string | null;',
        '};',
        '',
        '/** Keyed by LIRR station name (stops.txt stop_name). Ordered rail, subway, then bus. */',
        'export const STATION_TRANSFERS: Readonly<Record<string, readonly StationTransfer[]>> = {',
    ]
    for station in stations:
        items = sorted(transfers[station['name']].values(), key=lambda t: (MODE_ORDER[t['mode']], t['agency'], natural_key(t['name'])))
        if not items:
            continue
        lines.append(f"  {station['name']!r}: [".replace('"', "'"))
        for t in items:
            def js(v):
                return 'null' if v is None else "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
            lines.append(f"    {{ agency: {js(t['agency'])}, mode: '{t['mode']}', name: {js(t['name'])}, color: {js(t['color'])}, textColor: {js(t['textColor'])} }},")
        lines.append('  ],')
    lines.append('};')
    OUT_TS.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
    for station in stations:
        names = [t['name'] for t in transfers[station['name']].values()]
        print(f"{station['name']:20s} {len(names):3d}  {', '.join(sorted(names, key=natural_key))[:110]}")


if __name__ == '__main__':
    main()
