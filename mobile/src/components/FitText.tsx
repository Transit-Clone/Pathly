import { useState } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle } from 'react-native';

type FitTextProps = Omit<TextProps, 'numberOfLines' | 'style'> & {
  style: StyleProp<TextStyle>;
  /** The smallest the text may shrink to, as a share of its font size: low, so long names (LIRR's) still show whole. */
  minimumScale?: number;
};

/**
 * One line of text that shrinks to fit its width instead of wrapping, on every screen size. iOS and
 * Android do this themselves; the web has no such option, so there the text is measured at full
 * size off screen and scaled down by how much it overflows.
 */
export function FitText({ minimumScale = 0.35, style, ...props }: FitTextProps) {
  if (Platform.OS !== 'web') {
    return <Text {...props} adjustsFontSizeToFit={true} minimumFontScale={minimumScale} numberOfLines={1} style={style} />;
  }
  return <WebFitText {...props} minimumScale={minimumScale} style={style} />;
}

function WebFitText({ minimumScale = 0.35, style, ...props }: FitTextProps) {
  const [available, setAvailable] = useState(0);
  const [natural, setNatural] = useState(0);
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 14;
  // A hair under the exact fit, so rounding never tips it into an ellipsis.
  const scale = available > 0 && natural > available ? Math.max(minimumScale, (available / natural) * 0.98) : 1;
  const sized: TextStyle = { fontSize: fontSize * scale, lineHeight: flat.lineHeight != null ? flat.lineHeight * scale : undefined };
  return (
    <View onLayout={(event) => setAvailable(event.nativeEvent.layout.width)} style={styles.frame}>
      <Text {...props} numberOfLines={1} style={[style, sized]} />
      <Text
        accessibilityElementsHidden={true}
        aria-hidden={true}
        importantForAccessibility="no-hide-descendants"
        onLayout={(event) => setNatural(event.nativeEvent.layout.width)}
        style={[style, styles.measure]}
      >
        {props.children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'stretch', overflow: 'hidden' },
  // Laid out at full size on one line, out of sight, to learn how wide the text wants to be.
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, pointerEvents: 'none', whiteSpace: 'nowrap' } as TextStyle,
});
