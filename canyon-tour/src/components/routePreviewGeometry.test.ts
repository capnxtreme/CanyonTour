import { buildRoutePreviewView } from './routePreviewGeometry';

describe('buildRoutePreviewView', () => {
  test('returns null for empty input', () => {
    expect(buildRoutePreviewView([])).toBeNull();
  });

  test('projects points inside the SVG bounds', () => {
    const view = buildRoutePreviewView([
      { lat: 32.7, lon: -116.9 },
      { lat: 32.75, lon: -116.8 },
      { lat: 32.72, lon: -116.85 },
    ]);
    expect(view).not.toBeNull();
    const { WIDTH, HEIGHT, project } = view!;

    const a = project({ lat: 32.7, lon: -116.9 });
    const b = project({ lat: 32.75, lon: -116.8 });

    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x).toBeLessThanOrEqual(WIDTH);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeLessThanOrEqual(HEIGHT);
    expect(b.x).toBeGreaterThan(a.x); // east is to the right
    expect(b.y).toBeLessThan(a.y); // north is up (smaller y)
  });

  test('handles a single point without NaN', () => {
    const view = buildRoutePreviewView([{ lat: 33.0, lon: -117.0 }]);
    expect(view).not.toBeNull();
    const p = view!.project({ lat: 33.0, lon: -117.0 });
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });
});
