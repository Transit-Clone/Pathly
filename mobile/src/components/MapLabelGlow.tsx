import { StyleSheet, View } from 'react-native';
import Svg, { RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * A soft wash of `color` (the sheet's) spreading from the map's top-left corner and fading to
 * clear by `width` × `height`: a label drawn there stays readable over busy streets, and the rest of
 * the map stays uncovered.
 */
export function MapLabelGlow({ color, height, width }: { color: string; height: number; width: number }) {
  return (
    <View pointerEvents="none" style={[styles.glow, { height, width }]} testID="map-label-glow">
      <Svg height="100%" width="100%">
        <RadialGradient cx="0%" cy="0%" id="mapLabelGlow" rx="100%" ry="100%">
          <Stop offset="0" stopColor={color} stopOpacity={0.92} />
          <Stop offset="0.6" stopColor={color} stopOpacity={0.6} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
        <Rect fill="url(#mapLabelGlow)" height="100%" width="100%" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0 },
});
