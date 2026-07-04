import { getSavedRoutes, saveRoute, deleteSavedRoute, renameSavedRoute } from './savedRoutes';

describe('savedRoutes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('starts empty', () => {
    expect(getSavedRoutes()).toEqual([]);
  });

  test('saves and retrieves a route', () => {
    const saved = saveRoute({
      name: 'Twisty Explorer: Jamul → Descanso',
      start: 'Jamul, CA',
      end: 'Descanso, CA',
      waypointLocations: ['Lyons Valley Road', 'Japatul Valley Road'],
      routeUrl: 'https://www.google.com/maps/dir/a/b',
      wazeUrl: 'https://waze.com/ul?q=Descanso',
    });

    const routes = getSavedRoutes();
    expect(routes).toHaveLength(1);
    expect(routes[0].id).toBe(saved.id);
    expect(routes[0].name).toBe('Twisty Explorer: Jamul → Descanso');
    expect(routes[0].waypointLocations).toHaveLength(2);
    expect(routes[0].savedAt).toBeTruthy();
  });

  test('newest routes come first', () => {
    saveRoute({ name: 'first', start: 'a', end: 'b', waypointLocations: [], routeUrl: 'u1', wazeUrl: '' });
    saveRoute({ name: 'second', start: 'c', end: 'd', waypointLocations: [], routeUrl: 'u2', wazeUrl: '' });

    const routes = getSavedRoutes();
    expect(routes.map(r => r.name)).toEqual(['second', 'first']);
  });

  test('deletes a route by id', () => {
    const keep = saveRoute({ name: 'keep', start: 'a', end: 'b', waypointLocations: [], routeUrl: 'u1', wazeUrl: '' });
    const remove = saveRoute({ name: 'remove', start: 'c', end: 'd', waypointLocations: [], routeUrl: 'u2', wazeUrl: '' });

    const remaining = deleteSavedRoute(remove.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(keep.id);
    expect(getSavedRoutes()).toHaveLength(1);
  });

  test('renames a route by id', () => {
    const saved = saveRoute({ name: 'old name', start: 'a', end: 'b', waypointLocations: [], routeUrl: 'u', wazeUrl: '' });

    const updated = renameSavedRoute(saved.id, '  Sunday Canyon Run  ');
    expect(updated[0].name).toBe('Sunday Canyon Run');
    expect(getSavedRoutes()[0].name).toBe('Sunday Canyon Run');
  });

  test('ignores rename to empty name', () => {
    const saved = saveRoute({ name: 'keep me', start: 'a', end: 'b', waypointLocations: [], routeUrl: 'u', wazeUrl: '' });

    const updated = renameSavedRoute(saved.id, '   ');
    expect(updated[0].name).toBe('keep me');
  });

  test('survives corrupted storage gracefully', () => {
    localStorage.setItem('canyon-tour-saved-routes', 'not-json{');
    expect(getSavedRoutes()).toEqual([]);
  });
});
