export const fontFamilies = {
  regular: 'Nunito_400Regular',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extraBold: 'Nunito_800ExtraBold',
} as const;

export const typography = {
  screenHeading: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  sectionHeading: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 20,
    lineHeight: 25,
  },
  routeName: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 18,
    lineHeight: 23,
  },
  displayTime: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 24,
    lineHeight: 29,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  bodyStrong: {
    fontFamily: fontFamilies.bold,
    fontSize: 14,
    lineHeight: 20,
  },
  metadata: {
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
  label: {
    fontFamily: fontFamilies.extraBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.7,
  },
} as const;
