import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

const REQUEST_TIMEOUT_MS = 4_500;

function getDefaultApiUrl() {
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';
}

function normalizeUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export function useApiHeartbeat() {
  const apiUrl = useMemo(
    () => normalizeUrl(process.env.EXPO_PUBLIC_API_URL || getDefaultApiUrl()),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    async function checkHealth() {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        await response.json();
      } catch {
        // The interface remains usable when the development API is unavailable.
      } finally {
        clearTimeout(timeout);
      }
    }

    void checkHealth();

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [apiUrl]);
}
