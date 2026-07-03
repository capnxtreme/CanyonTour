/**
 * Centralized environment access (Vite exposes vars via import.meta.env).
 */

export const isDev = (): boolean => import.meta.env.DEV;

export const getGoogleMapsApiKey = (): string | undefined =>
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export const isVerboseLogging = (): boolean =>
  import.meta.env.VITE_VERBOSE_LOGGING === 'true';
