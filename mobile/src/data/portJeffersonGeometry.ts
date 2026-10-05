/**
 * The complete real Port Jefferson Branch, Penn Station through Port Jefferson, in real
 * travel order — not just the Stony Brook-local segment, so this works for a rider
 * boarding anywhere on the branch, not only near Stony Brook. From
 * firebase/functions/static_data/lirr/{stops,stop_times}.txt (two trips stitched at Huntington,
 * where LIRR itself splits electric/diesel service; "Hillside Facility" between Elmont and
 * Jamaica is a maintenance yard, not a passenger stop, so it's excluded).
 */
export const PORT_JEFFERSON_STOPS = [
  { name: 'Penn Station', lat: 40.75058844, lon: -73.99358408 },
  { name: 'Woodside', lat: 40.74585067, lon: -73.90297516 },
  { name: 'Forest Hills', lat: 40.71957556, lon: -73.84481402 },
  { name: 'Kew Gardens', lat: 40.70964917, lon: -73.83088807 },
  { name: 'Jamaica', lat: 40.69960817, lon: -73.80852987 },
  { name: 'Elmont-UBS Arena', lat: 40.720074, lon: -73.725549 },
  { name: 'New Hyde Park', lat: 40.73075708, lon: -73.68095886 },
  { name: 'Merillon Avenue', lat: 40.73516903, lon: -73.66252148 },
  { name: 'Mineola', lat: 40.74034743, lon: -73.64086293 },
  { name: 'Carle Place', lat: 40.74920704, lon: -73.60365242 },
  { name: 'Westbury', lat: 40.75345386, lon: -73.5858661 },
  { name: 'Hicksville', lat: 40.76717491, lon: -73.52853322 },
  { name: 'Syosset', lat: 40.82485746, lon: -73.5004456 },
  { name: 'Cold Spring Harbor', lat: 40.83563832, lon: -73.45108591 },
  { name: 'Huntington', lat: 40.85300971, lon: -73.40952576 },
  { name: 'Greenlawn', lat: 40.86866524, lon: -73.36284977 },
  { name: 'Northport', lat: 40.88064972, lon: -73.32848513 },
  { name: 'Kings Park', lat: 40.88366659, lon: -73.25624757 },
  { name: 'Smithtown', lat: 40.85654755, lon: -73.19803235 },
  { name: 'St. James', lat: 40.88216931, lon: -73.15950725 },
  { name: 'Stony Brook', lat: 40.92032252, lon: -73.12854943 },
  { name: 'Port Jefferson', lat: 40.9345531, lon: -73.05250164 },
] as const;
