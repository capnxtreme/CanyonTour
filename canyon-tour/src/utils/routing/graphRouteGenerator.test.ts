import { generateScenicRouteOptions, pathToWaypoints } from './graphRouteGenerator';
import { buildRoadGraph } from './roadGraph';
import { findBestPath, ROUTE_PROFILES } from './graphRouter';
import { Coordinates } from '../../types';
import { getDirections } from '../../services/googleMapsService';
import { makeMockDirectionsResult } from '../../testUtils/mockDirections';
import { buildSyntheticNetwork } from '../../testUtils/syntheticOsm';

vi.mock('../../services/googleMapsService', () => ({
  getDirections: vi.fn(),
}));

const getDirectionsMock = vi.mocked(getDirections);

beforeEach(() => {
  getDirectionsMock.mockClear();
  getDirectionsMock.mockImplementation(
    async (start: Coordinates, end: Coordinates, waypoints: Coordinates[]) =>
      makeMockDirectionsResult(start, end, waypoints)
  );
});

const start: Coordinates = { lat: 32.7, lon: -116.9 }; // node A
const end: Coordinates = { lat: 32.7, lon: -116.8 };   // node B

describe('generateScenicRouteOptions', () => {
  test('produces distinct scenic and direct options', async () => {
    const options = await generateScenicRouteOptions(buildSyntheticNetwork(), start, end);

    expect(options.length).toBeGreaterThanOrEqual(2);

    const names = options.map(o => o.name);
    expect(new Set(names).size).toBe(names.length); // all distinct

    // The scenic option must actually route over the twisty road.
    const scenic = options.find(o => o.name === 'Twisty Explorer')!;
    expect(scenic).toBeDefined();
    expect(scenic.totalTwistiness).toBeGreaterThan(2);
    scenic.waypoints.forEach(wp => {
      expect(wp.location).toBe('Twisty Road');
    });

    // A less twisty baseline option must exist as well.
    const baseline = options.find(o => o.name !== 'Twisty Explorer')!;
    expect(baseline.totalTwistiness!).toBeLessThan(scenic.totalTwistiness!);
  });

  test('route options include real distance/duration and directions', async () => {
    const options = await generateScenicRouteOptions(buildSyntheticNetwork(), start, end);
    options.forEach(option => {
      expect(option.directions).toBeDefined();
      expect(option.distance).toBeGreaterThan(0);
      expect(option.duration).toBeGreaterThan(0);
      expect(option.waypoints.length).toBeLessThanOrEqual(10);
      option.waypoints.forEach(wp => {
        expect(wp.coordinates).toBeDefined();
        expect(wp.checked).toBe(true);
      });
    });
  });

  test('is deterministic', async () => {
    const first = await generateScenicRouteOptions(buildSyntheticNetwork(), start, end);
    const second = await generateScenicRouteOptions(buildSyntheticNetwork(), start, end);

    const summarize = (options: typeof first) =>
      options.map(o => ({
        name: o.name,
        waypoints: o.waypoints.map(wp => wp.coordinates),
      }));

    expect(summarize(second)).toEqual(summarize(first));
  });

  test('still produces route options with estimates when Directions is unavailable (keyless mode)', async () => {
    getDirectionsMock.mockResolvedValue(null);

    const options = await generateScenicRouteOptions(buildSyntheticNetwork(), start, end);

    expect(options.length).toBeGreaterThanOrEqual(2);
    options.forEach(option => {
      expect(option.directions).toBeUndefined();
      // Estimates come from the graph path itself.
      expect(option.distance).toBeGreaterThan(5);
      expect(option.duration).toBeGreaterThan(0);
      expect(option.waypoints.length).toBeGreaterThan(0);
    });
  });

  test('returns empty list when the area has no suitable roads', async () => {
    const options = await generateScenicRouteOptions({ elements: [] }, start, end);
    expect(options).toEqual([]);
    expect(getDirections).not.toHaveBeenCalled();
  });

  test('returns empty list when start is too far from the road network', async () => {
    const farStart: Coordinates = { lat: 45.0, lon: -100.0 };
    const options = await generateScenicRouteOptions(buildSyntheticNetwork(), farStart, end);
    expect(options).toEqual([]);
  });
});

describe('pathToWaypoints', () => {
  test('pins lie on the selected path with endpoint clearance', () => {
    const graph = buildRoadGraph(buildSyntheticNetwork());
    const profile = ROUTE_PROFILES[0];
    const path = findBestPath(graph, 1, 2, profile)!;

    const waypoints = pathToWaypoints(path, profile);
    expect(waypoints.length).toBeGreaterThan(0);
    expect(waypoints.length).toBeLessThanOrEqual(10);

    // Every pin coordinate must be an actual vertex of the path geometry.
    const pathVertices = new Set(
      path.edges.flatMap(edge => edge.geometry.map(p => `${p.lat},${p.lon}`))
    );
    waypoints.forEach(wp => {
      expect(pathVertices.has(`${wp.coordinates!.lat},${wp.coordinates!.lon}`)).toBe(true);
    });
  });
});
