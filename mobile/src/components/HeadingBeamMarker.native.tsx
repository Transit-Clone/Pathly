import { useEffect, useState } from 'react';
import { Marker } from 'react-native-maps';

import { useDeviceHeading } from '../hooks/useDeviceHeading';
import { HeadingBeam } from './HeadingBeam';

/** How long the beam's marker keeps redrawing after it mounts, so its drawing is in the snapshot. */
const BEAM_SETTLE_MS = 600;

/**
 * The rider's flashlight beam under their blue dot, turned to where the phone faces. A flat
 * marker turned by `rotation` stays true to north however the map itself is turned. Nothing shows
 * without a compass.
 */
export function HeadingBeamMarker({ coordinate }: { coordinate: { latitude: number; longitude: number } }) {
  const heading = useDeviceHeading();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), BEAM_SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  if (heading == null) return null;
  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={coordinate}
      flat={true}
      rotation={heading}
      tappable={false}
      testID="heading-beam"
      tracksViewChanges={!settled}
      zIndex={0}
    >
      <HeadingBeam />
    </Marker>
  );
}
