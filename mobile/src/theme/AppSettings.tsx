import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';

import { DEFAULT_DESTINATION_PIN, normalizeDestinationPin, type DestinationPinStyle } from '../data/destinationPin';
import { SAVED_PLACE_COLOR_HEX } from '../data/savedPlacePin';
import type { SavedPlaceColor } from '../data/userData';
import { darkColors, highContrastDarkColors, highContrastLightColors, lightColors, type Palette } from './colors';

export type Appearance = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';
export type TextSize = 'compact' | 'default' | 'large';

/** How much each text size scales every font size and line height. */
export const TEXT_SCALE: Record<TextSize, number> = { compact: 0.9, default: 1, large: 1.15 };

/** Display settings are the device's, not the account's, so they apply on the sign-in screen too. */
export const DISPLAY_SETTINGS_KEY = 'pathly.display.v1';

/** The home map's explore dot: the theme's own purple, or one of the saved-place colors. */
export type MapDotColor = 'default' | SavedPlaceColor;

type DisplaySettings = { appearance: Appearance; reducedMotion: boolean; textSize: TextSize; highContrast: boolean; mapDotColor: MapDotColor; destinationPin: DestinationPinStyle };

type AppSettingsValue = {
  appearance: Appearance;
  colors: Palette;
  /** The trip maps' destination pin, as the rider customized it. */
  destinationPin: DestinationPinStyle;
  highContrast: boolean;
  isDark: boolean;
  mapDotColor: MapDotColor;
  /** True when either the app toggle or the device asks for reduced motion. */
  reducedMotionActive: boolean;
  reducedMotion: boolean;
  scheme: ColorScheme;
  textSize: TextSize;
  /** TEXT_SCALE for textSize; useThemedStyles applies it to every themed font size. */
  textScale: number;
  setAppearance: (appearance: Appearance) => void;
  setDestinationPin: (value: DestinationPinStyle) => void;
  setHighContrast: (value: boolean) => void;
  setMapDotColor: (value: MapDotColor) => void;
  setReducedMotion: (value: boolean) => void;
  setTextSize: (value: TextSize) => void;
};

const AppSettingsContext = createContext<AppSettingsValue | null>(null);

export function resolveScheme(appearance: Appearance, systemScheme: string | null | undefined): ColorScheme {
  if (appearance === 'system') return systemScheme === 'dark' ? 'dark' : 'light';
  return appearance;
}

export function paletteFor(scheme: ColorScheme, highContrast: boolean): Palette {
  if (highContrast) return scheme === 'dark' ? highContrastDarkColors : highContrastLightColors;
  return scheme === 'dark' ? darkColors : lightColors;
}

/** Keeps only well-formed saved values, so a stale or hand-edited entry can't break the theme. */
function parseDisplaySettings(text: string | null): Partial<DisplaySettings> {
  if (!text) return {};
  try {
    const saved = JSON.parse(text) as Record<string, unknown>;
    const settings: Partial<DisplaySettings> = {};
    if (saved.appearance === 'light' || saved.appearance === 'dark' || saved.appearance === 'system') settings.appearance = saved.appearance;
    if (typeof saved.reducedMotion === 'boolean') settings.reducedMotion = saved.reducedMotion;
    if (saved.textSize === 'compact' || saved.textSize === 'default' || saved.textSize === 'large') settings.textSize = saved.textSize;
    if (typeof saved.highContrast === 'boolean') settings.highContrast = saved.highContrast;
    if (saved.destinationPin !== undefined) settings.destinationPin = normalizeDestinationPin(saved.destinationPin);
    if (saved.mapDotColor === 'default' || (typeof saved.mapDotColor === 'string' && Object.hasOwn(SAVED_PLACE_COLOR_HEX, saved.mapDotColor))) settings.mapDotColor = saved.mapDotColor as MapDotColor;
    return settings;
  } catch {
    return {};
  }
}

type AppSettingsProviderProps = {
  children: ReactNode;
  initialAppearance?: Appearance;
  initialReducedMotion?: boolean;
  initialTextSize?: TextSize;
  initialHighContrast?: boolean;
};

/** App preferences every screen reads (appearance, motion, text size, contrast), saved on the device. */
export function AppSettingsProvider({ children, initialAppearance = 'light', initialReducedMotion = false, initialTextSize = 'default', initialHighContrast = false }: AppSettingsProviderProps) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<DisplaySettings>({ appearance: initialAppearance, reducedMotion: initialReducedMotion, textSize: initialTextSize, highContrast: initialHighContrast, mapDotColor: 'default', destinationPin: { ...DEFAULT_DESTINATION_PIN } });
  const [deviceReducedMotion, setDeviceReducedMotion] = useState(false);
  // A choice made before the saved settings finish loading wins over them.
  const changedBeforeLoad = useRef(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(DISPLAY_SETTINGS_KEY)
      .then((text) => {
        const saved = parseDisplaySettings(text);
        if (mounted && !changedBeforeLoad.current && Object.keys(saved).length > 0) setSettings((current) => ({ ...current, ...saved }));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

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

  const update = useCallback((patch: Partial<DisplaySettings>) => {
    changedBeforeLoad.current = true;
    setSettings((current) => {
      const next = { ...current, ...patch };
      AsyncStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const value = useMemo<AppSettingsValue>(() => {
    const { appearance, destinationPin, highContrast, mapDotColor, reducedMotion, textSize } = settings;
    const scheme = resolveScheme(appearance, systemScheme);
    const palette = paletteFor(scheme, highContrast);
    return {
      appearance,
      colors: mapDotColor === 'default' ? palette : { ...palette, searchCenter: SAVED_PLACE_COLOR_HEX[mapDotColor] },
      destinationPin,
      highContrast,
      isDark: scheme === 'dark',
      mapDotColor,
      reducedMotion,
      reducedMotionActive: reducedMotion || deviceReducedMotion,
      scheme,
      textSize,
      textScale: TEXT_SCALE[textSize],
      setAppearance: (next) => update({ appearance: next }),
      setDestinationPin: (next) => update({ destinationPin: normalizeDestinationPin(next) }),
      setHighContrast: (next) => update({ highContrast: next }),
      setMapDotColor: (next) => update({ mapDotColor: next }),
      setReducedMotion: (next) => update({ reducedMotion: next }),
      setTextSize: (next) => update({ textSize: next }),
    };
  }, [deviceReducedMotion, settings, systemScheme, update]);

  // On web, the page itself behind the app: the theme's background, so a screen fading in (or an
  // overscroll) never flashes the browser's white in dark mode.
  const pageBackground = value.colors.background;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = pageBackground;
    document.body.style.backgroundColor = pageBackground;
  }, [pageBackground]);

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

const fallback: AppSettingsValue = {
  appearance: 'light',
  colors: lightColors,
  destinationPin: DEFAULT_DESTINATION_PIN,
  highContrast: false,
  isDark: false,
  mapDotColor: 'default',
  reducedMotion: false,
  reducedMotionActive: false,
  scheme: 'light',
  textSize: 'default',
  textScale: 1,
  setAppearance: () => undefined,
  setDestinationPin: () => undefined,
  setHighContrast: () => undefined,
  setMapDotColor: () => undefined,
  setReducedMotion: () => undefined,
  setTextSize: () => undefined,
};

export function useAppSettings() {
  return useContext(AppSettingsContext) ?? fallback;
}

export function useTheme() {
  const { colors, isDark, scheme } = useAppSettings();
  return { colors, isDark, scheme };
}

/** Half-point steps keep scaled text crisp. */
function scaled(value: number, scale: number) {
  return Math.round(value * scale * 2) / 2;
}

/**
 * Scales the font size and line height of every style in a stylesheet (Accessibility -> Text
 * size). Styles without text keep their identity; at the default size the sheet is unchanged.
 */
export function scaleTypography<T>(styles: T, scale: number): T {
  if (scale === 1 || styles === null || typeof styles !== 'object') return styles;
  const result: Record<string, unknown> = {};
  for (const [key, style] of Object.entries(styles as Record<string, unknown>)) {
    if (style !== null && typeof style === 'object' && !Array.isArray(style)) {
      const { fontSize, lineHeight } = style as { fontSize?: unknown; lineHeight?: unknown };
      if (typeof fontSize === 'number' || typeof lineHeight === 'number') {
        result[key] = {
          ...style,
          ...(typeof fontSize === 'number' ? { fontSize: scaled(fontSize, scale) } : {}),
          ...(typeof lineHeight === 'number' ? { lineHeight: scaled(lineHeight, scale) } : {}),
        };
        continue;
      }
    }
    result[key] = style;
  }
  return result as T;
}

/** Builds a StyleSheet from the active palette and text size, rebuilding only when either changes. */
export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const { colors, textScale } = useAppSettings();
  return useMemo(() => scaleTypography(factory(colors), textScale), [colors, factory, textScale]);
}

/** Status bar whose content color follows the active theme. */
export function ThemedStatusBar() {
  const { isDark } = useAppSettings();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}
