import { Coordinates } from '../types';
import * as geolib from 'geolib';

/**
 * Builds a fake google.maps.DirectionsResult from a start, end, and waypoint
 * list by linearly interpolating an overview_path between consecutive stops.
 * This lets routing tests run without the Google Maps JS API, while still
 * exercising the out-and-back analysis (which reads overview_path geometry)
 * and the distance/duration extraction (which reads legs).
 */
export function makeMockDirectionsResult(
  start: Coordinates,
  end: Coordinates,
  waypoints: Coordinates[]
): google.maps.DirectionsResult {
  const stops = [start, ...waypoints, end];
  const POINTS_PER_LEG = 10;

  const overviewPath: Array<{ lat: () => number; lng: () => number }> = [];
  const legs: Array<{
    distance: { value: number; text: string };
    duration: { value: number; text: string };
  }> = [];

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    for (let j = 0; j < POINTS_PER_LEG; j++) {
      const t = j / POINTS_PER_LEG;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      overviewPath.push({ lat: () => lat, lng: () => lon });
    }

    const straightLine = geolib.getDistance(a, b);
    // Roads are never perfectly straight; approximate driving distance.
    const drivingDistance = Math.round(straightLine * 1.2);
    legs.push({
      distance: { value: drivingDistance, text: `${(drivingDistance / 1000).toFixed(1)} km` },
      duration: { value: Math.round(drivingDistance / 15), text: 'mock' },
    });
  }

  // Close the path at the final destination.
  overviewPath.push({ lat: () => end.lat, lng: () => end.lon });

  return {
    routes: [
      {
        overview_path: overviewPath,
        legs,
      },
    ],
  } as unknown as google.maps.DirectionsResult;
}
