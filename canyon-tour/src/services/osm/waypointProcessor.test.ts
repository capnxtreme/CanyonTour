import { processOsmData } from './waypointProcessor';
import { Coordinates } from '../../types';
import lyonsValleyFixture from './__fixtures__/lyons_valley.json';

// Real Overpass API response for the Lyons Valley Road area (San Diego
// County) checked in as a fixture, so the OSM -> waypoint pipeline can be
// regression-tested offline and deterministically.
describe('processOsmData (Lyons Valley fixture)', () => {
  // Jamul, CA -> Japatul Valley area: brackets the Lyons Valley Road corridor
  const startCoords: Coordinates = { lat: 32.7171, lon: -116.876 };
  const endCoords: Coordinates = { lat: 32.8265, lon: -116.6423 };

  const osmData = lyonsValleyFixture as { elements: any[] };

  test('produces waypoints from real OSM way data', () => {
    const waypoints = processOsmData(osmData, startCoords, endCoords);

    expect(waypoints.length).toBeGreaterThan(0);
    // Every waypoint must be routable: valid coordinates and a twistiness score
    waypoints.forEach(wp => {
      expect(wp.coordinates).toBeDefined();
      expect(typeof wp.coordinates!.lat).toBe('number');
      expect(typeof wp.coordinates!.lon).toBe('number');
      expect(wp.twistiness).toBeGreaterThan(0);
    });
  });

  test('recognizes Lyons Valley Road segments (2-lane paved secondary)', () => {
    const waypoints = processOsmData(osmData, startCoords, endCoords);

    const lyonsWaypoints = waypoints.filter(
      wp => wp.tags?.name === 'Lyons Valley Road'
    );
    expect(lyonsWaypoints.length).toBeGreaterThan(0);
    // Secondary 2-lane paved roads are the prime target; they must score well
    lyonsWaypoints.forEach(wp => {
      expect(wp.roadType).toBe('secondary');
      expect(wp.twistiness).toBeGreaterThan(0.5);
    });
  });

  test('is deterministic for identical input', () => {
    const first = processOsmData(osmData, startCoords, endCoords);
    const second = processOsmData(osmData, startCoords, endCoords);

    expect(second.map(wp => ({ id: wp.id, twistiness: wp.twistiness }))).toEqual(
      first.map(wp => ({ id: wp.id, twistiness: wp.twistiness }))
    );
  });

  test('excludes unpaved roads and roads with fewer than 2 lanes', () => {
    const unpavedWay = {
      type: 'way',
      id: 999901,
      nodes: osmData.elements.find((e: any) => e.type === 'way').nodes,
      tags: { highway: 'secondary', name: 'Dirt Test Road', surface: 'dirt', lanes: '2' },
    };
    const narrowWay = {
      type: 'way',
      id: 999902,
      nodes: osmData.elements.find((e: any) => e.type === 'way').nodes,
      tags: { highway: 'secondary', name: 'Narrow Test Road', surface: 'asphalt', lanes: '1' },
    };
    const augmented = { elements: [...osmData.elements, unpavedWay, narrowWay] };

    const waypoints = processOsmData(augmented, startCoords, endCoords);

    expect(waypoints.some(wp => wp.tags?.name === 'Dirt Test Road')).toBe(false);
    expect(waypoints.some(wp => wp.tags?.name === 'Narrow Test Road')).toBe(false);
  });
});
