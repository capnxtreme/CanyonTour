import { Coordinates } from '../types';

export interface RoutePreviewView {
  WIDTH: number;
  HEIGHT: number;
  project: (p: Coordinates) => { x: number; y: number };
}

/**
 * Builds an SVG projection for a set of geographic points, preserving
 * aspect ratio with a cosine correction for longitude at mid-latitude.
 */
export function buildRoutePreviewView(
  points: Coordinates[],
  width = 800,
  height = 600
): RoutePreviewView | null {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }

  const latPad = Math.max((maxLat - minLat) * 0.08, 0.005);
  const lonPad = Math.max((maxLon - minLon) * 0.08, 0.005);
  minLat -= latPad;
  maxLat += latPad;
  minLon -= lonPad;
  maxLon += lonPad;

  const latSpan = maxLat - minLat || 0.01;
  const lonSpan = maxLon - minLon || 0.01;
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const geoWidth = lonSpan * lonScale;
  const geoHeight = latSpan;
  const scale = Math.min(width / geoWidth, height / geoHeight);
  const offsetX = (width - geoWidth * scale) / 2;
  const offsetY = (height - geoHeight * scale) / 2;

  return {
    WIDTH: width,
    HEIGHT: height,
    project: (p: Coordinates) => ({
      x: offsetX + (p.lon - minLon) * lonScale * scale,
      y: offsetY + (maxLat - p.lat) * scale,
    }),
  };
}
