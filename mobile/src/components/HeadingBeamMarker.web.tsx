import { OverlayViewF, OVERLAY_LAYER } from '@react-google-maps/api';
import { View } from 'react-native';

import { useDeviceHeading } from '../hooks/useDeviceHeading';
import { HEADING_BEAM_SIZE, HeadingBeam } from './HeadingBeam';

const beamOffset = () => ({ x: -HEADING_BEAM_SIZE / 2, y: -HEADING_BEAM_SIZE / 2 });

/**
 * The rider's flashlight beam under their blue dot, turned to where the phone faces (web maps are
 * never rotated, so north is up). Nothing shows without a compass, as on a desktop browser.
 */
export function HeadingBeamMarker({ coordinate }: { coordinate: { latitude: number; longitude: number } }) {
  const heading = useDeviceHeading();
  if (heading == null) return null;
  return (
    <OverlayViewF getPixelPositionOffset={beamOffset} mapPaneName={OVERLAY_LAYER} position={{ lat: coordinate.latitude, lng: coordinate.longitude }}>
      <View
        pointerEvents="none"
        // Eased, so the beam swings round rather than jumping between compass readings.
        style={{ width: HEADING_BEAM_SIZE, height: HEADING_BEAM_SIZE, transform: [{ rotate: `${heading}deg` }], transitionDuration: '200ms', transitionProperty: 'transform' } as object}
        testID="heading-beam"
      >
        <HeadingBeam />
      </View>
    </OverlayViewF>
  );
}
