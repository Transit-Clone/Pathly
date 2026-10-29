import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { phosphorGlyphs, type PhosphorGlyphName } from './phosphorGlyphs';

type PhosphorGlyphProps = {
  color: string;
  name: PhosphorGlyphName;
  size: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** One Phosphor glyph as SVG, hidden from screen readers (the control around it carries the label). */
export function PhosphorGlyph({ color, name, size, style, testID }: PhosphorGlyphProps) {
  return (
    <View accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants" style={[{ height: size, width: size }, style]} testID={testID}>
      <Svg fill={color} height={size} viewBox="0 0 256 256" width={size}>
        {phosphorGlyphs[name].map((d) => <Path d={d} key={d} />)}
      </Svg>
    </View>
  );
}
