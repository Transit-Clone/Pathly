import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { darkColors, lightColors, type Palette } from './colors';

export type Appearance = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

type AppSettingsValue = {
  appearance: Appearance;
  colors: Palette;
  isDark: boolean;
  /** True when either the app toggle or the device asks for reduced motion. */
  reducedMotionActive: boolean;
  reducedMotion: boolean;
  scheme: ColorScheme;
  setAppearance: (appearance: Appearance) => void;
  setReducedMotion: (value: boolean) => void;
};

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

export function resolveScheme(appearance: Appearance, systemScheme: string | null | undefined): ColorScheme {
  if (appearance === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return appearance;
}

type AppSettingsProviderProps = {
  children: ReactNode;
  initialAppearance?: Appearance;
  initialReducedMotion?: boolean;
};

/** Session-only app preferences that every screen reads (appearance and motion). */
export function AppSettingsProvider({ children, initialAppearance = 'light', initialReducedMotion = false }: AppSettingsProviderProps) {
  const systemScheme = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>(initialAppearance);
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion);
  const [deviceReducedMotion, setDeviceReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => {
        if (mounted && enabled) setDeviceReducedMotion(true);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setDeviceReducedMotion);
    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, []);

  const value = useMemo<AppSettingsValue>(() => {
    const scheme = resolveScheme(appearance, systemScheme);
    return {
      appearance,
      colors: scheme === 'dark' ? darkColors : lightColors,
      isDark: scheme === 'dark',
      reducedMotion,
      reducedMotionActive: reducedMotion || deviceReducedMotion,
      scheme,
      setAppearance,
      setReducedMotion,
    };
  }, [appearance, deviceReducedMotion, reducedMotion, systemScheme]);

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

const fallback: AppSettingsValue = {
  appearance: 'light',
  colors: lightColors,
  isDark: false,
  reducedMotion: false,
  reducedMotionActive: false,
  scheme: 'light',
  setAppearance: () => undefined,
  setReducedMotion: () => undefined,
};

export function useAppSettings() {
  return useContext(AppSettingsContext) ?? fallback;
}

export function useTheme() {
  const { colors, isDark, scheme } = useAppSettings();
  return { colors, isDark, scheme };
}

/** Builds a StyleSheet from the active palette, rebuilding only when the theme changes. */
export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const { colors } = useAppSettings();
  return useMemo(() => factory(colors), [colors, factory]);
}

/** Status bar whose content color follows the active theme. */
export function ThemedStatusBar() {
  const { isDark } = useAppSettings();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
