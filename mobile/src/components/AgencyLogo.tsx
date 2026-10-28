import type { ReactElement } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { LiveSource } from '../data/transit';
import { useTheme } from '../theme/AppSettings';
import { LIRR_LOGO, NICE_LOGO, NYC_FERRY_LOGO } from './agencyLogoSvgs';

type AgencyId = LiveSource['agencyId'];

/** The MTA's mark, from the header of mta.info, in MTA blue. */
const MTA_LOGO = '<svg viewBox="0 0 47 51" xmlns="http://www.w3.org/2000/svg"><path d="M29.909 21.372l-2.743-.234v14.56l-4.088.724-.01-15.644-3.474-.308v-5.734l10.315 1.803v4.833zm7.785 12.484l-2.426.421-.283-2.122-2.363.307-.296 2.335-3.125.553 3.094-18.36 2.937.51 2.462 16.356zm-3.141-5.288l-.65-5.606h-.142l-.658 5.691 1.45-.085zM21.038 50.931c13.986 0 25.32-11.402 25.32-25.465C46.359 11.4 35.025 0 21.039 0 12.27 0 4.545 4.483 0 11.296l7.017 1.237 1.931 14.78c.007-.024.14-.009.14-.009l2.118-14.036 7.022 1.229V37.28l-4.432.776v-9.79s.164-4.217.067-4.938c0 0-.193.005-.196-.011l-2.644 15.236-4.403.777-3.236-16.412-.195-.014c-.069.594.237 5.744.237 5.744v11.243L.532 40.4c4.603 6.38 12.072 10.53 20.506 10.53v.001z" fill="#0039A6" fill-rule="nonzero"/></svg>';

/** The logos' navy and MTA blue, printed white on dark maps (as the agencies do on dark backgrounds). */
const DARK_INKS = /#0039A6|#002E56|#081F40/gi;

/** A transparent SVG logo `height` tall, its width from the viewBox. */
function svgLogo(xml: string, height: number) {
  const [, , w, h] = (xml.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 1 1').split(' ').map(Number);
  const width = (height * (w ?? 1)) / (h ?? 1);
  return function SvgLogo(isDark: boolean) {
    return <SvgXml height={height} width={width} xml={isDark ? xml.replace(DARK_INKS, '#FFFFFF') : xml} />;
  };
}

/**
 * Each agency's official logo, on a transparent background; the Staten Island Ferry has none.
 * The MTA bus and subway agencies share the MTA mark; the LIRR has its own.
 */
const logos: Partial<Record<AgencyId, { name: string; render: (isDark: boolean) => ReactElement }>> = {};
const mta = { name: 'MTA', render: svgLogo(MTA_LOGO, 20) };
for (const id of ['subway', 'bx', 'bk', 'mn', 'qn', 'si', 'busco'] as const) logos[id] = mta;
logos.lirr = { name: 'Long Island Rail Road', render: svgLogo(LIRR_LOGO, 18) };
logos.nice = { name: 'NICE', render: svgLogo(NICE_LOGO, 22) };
logos.nycferry = { name: 'NYC Ferry', render: svgLogo(NYC_FERRY_LOGO, 26) };
logos.suffolk = {
  name: 'Suffolk County Transit',
  render: () => <Image accessibilityIgnoresInvertColors={true} resizeMode="contain" source={require('../../assets/agency-logos/suffolk.png')} style={{ height: 24, width: (24 * 490) / 230 }} />,
};

export function hasAgencyLogo(agencyId: AgencyId | undefined): boolean {
  return agencyId != null && logos[agencyId] != null;
}

/** The agency's logo, or nothing. */
export function AgencyLogo({ agencyId, style, testID }: { agencyId: AgencyId | undefined; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { isDark } = useTheme();
  const logo = agencyId ? logos[agencyId] : undefined;
  if (!logo) return null;
  return (
    <View accessibilityLabel={logo.name} accessible={true} style={[styles.logo, style]} testID={testID}>
      {logo.render(isDark)}
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { alignSelf: 'flex-start' },
});
