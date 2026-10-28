import { View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { beanAvatarSvg, type BeanAvatarConfig } from './beanAvatar';

type BeanAvatarProps = {
  config?: BeanAvatarConfig;
  size?: number;
  /** Omit when adjacent text already identifies the person. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Same SVG renderer on web, iOS, and Android; no bitmap exports or downloads required. */
export function BeanAvatar({ config, size = 48, accessibilityLabel, style, testID }: BeanAvatarProps) {
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      style={[{ width: size, height: size }, style]}
      testID={testID}
    >
      <SvgXml accessible={false} xml={beanAvatarSvg(config)} width={size} height={size} />
    </View>
  );
}
