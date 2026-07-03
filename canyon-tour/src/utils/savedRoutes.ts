/**
 * Saved routes persistence (localStorage). Stores the shareable output of a
 * generated route so it can be reloaded without re-running discovery.
 */

export interface SavedRoute {
  id: string;
  name: string;
  start: string;
  end: string;
  waypointLocations: string[];
  routeUrl: string;
  wazeUrl: string;
  savedAt: string; // ISO timestamp
}

const STORAGE_KEY = 'canyon-tour-saved-routes';

export function getSavedRoutes(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRoute(route: Omit<SavedRoute, 'id' | 'savedAt'>): SavedRoute {
  const saved: SavedRoute = {
    ...route,
    // Date.now() alone can collide for rapid saves; UUID guarantees uniqueness.
    id: `route-${crypto.randomUUID()}`,
    savedAt: new Date().toISOString(),
  };
  const routes = getSavedRoutes();
  routes.unshift(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  return saved;
}

export function deleteSavedRoute(id: string): SavedRoute[] {
  const routes = getSavedRoutes().filter(route => route.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  return routes;
}
