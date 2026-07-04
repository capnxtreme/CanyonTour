import { routeToGpx, gpxFilename } from './gpxExport';
import { RouteOption } from '../types';

const makeOption = (overrides: Partial<RouteOption> = {}): RouteOption => ({
  name: 'Twisty Explorer',
  description: 'A twisty route',
  waypoints: [
    {
      id: 'wp1',
      location: 'Lyons Valley Road',
      description: 'Winding secondary road',
      checked: true,
      type: 'strategic_routing',
      coordinates: { lat: 32.7, lon: -116.7 },
    },
    {
      id: 'wp2',
      location: 'Unchecked Road',
      description: 'Should not appear',
      checked: false,
      type: 'strategic_routing',
      coordinates: { lat: 32.8, lon: -116.6 },
    },
  ],
  pathGeometry: [
    { lat: 32.70, lon: -116.90 },
    { lat: 32.71, lon: -116.85 },
    { lat: 32.70, lon: -116.80 },
  ],
  ...overrides,
});

describe('routeToGpx', () => {
  test('emits a track point for every path geometry vertex', () => {
    const gpx = routeToGpx(makeOption());
    expect(gpx).toContain('<?xml version="1.0"');
    expect(gpx).toContain('<gpx version="1.1"');
    expect((gpx.match(/<trkpt /g) || []).length).toBe(3);
    expect(gpx).toContain('lat="32.71" lon="-116.85"');
  });

  test('includes only checked waypoints as <wpt>', () => {
    const gpx = routeToGpx(makeOption());
    expect((gpx.match(/<wpt /g) || []).length).toBe(1);
    expect(gpx).toContain('<name>Lyons Valley Road</name>');
    expect(gpx).not.toContain('Unchecked Road');
  });

  test('falls back to waypoints when no path geometry is present', () => {
    const gpx = routeToGpx(makeOption({ pathGeometry: undefined }));
    // Two waypoints with coordinates become the track
    expect((gpx.match(/<trkpt /g) || []).length).toBe(2);
  });

  test('escapes XML special characters', () => {
    const gpx = routeToGpx(makeOption({ name: 'Route <A> & "B"' }));
    expect(gpx).toContain('Route &lt;A&gt; &amp; &quot;B&quot;');
    expect(gpx).not.toContain('<A>');
  });
});

describe('gpxFilename', () => {
  test('slugifies the route name', () => {
    expect(gpxFilename(makeOption({ name: 'Twisty Explorer (Alternative)' }))).toBe(
      'twisty_explorer_alternative.gpx'
    );
  });

  test('falls back for empty names', () => {
    expect(gpxFilename(makeOption({ name: '!!!' }))).toBe('canyon_tour_route.gpx');
  });
});
