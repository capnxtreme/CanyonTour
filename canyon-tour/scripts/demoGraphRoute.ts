/**
 * Offline demo / debugging tool for the graph routing engine.
 *
 * Fetches live Overpass data for a real corridor, builds the road graph,
 * runs every route profile, prints the roads each route uses, and renders
 * an SVG map of the graph + chosen routes.
 *
 * Run from canyon-tour/:  npx tsx scripts/demoGraphRoute.ts [output.svg]
 *
 * No Google Maps API key required — this exercises everything except the
 * final Directions call.
 */

import { writeFileSync } from 'fs';
import { osmClient } from '../src/services/osm/osmClient';
import { buildRoadGraph, snapEndpointsToSharedComponent, RoadGraph } from '../src/utils/routing/roadGraph';
import {
  findBestPath,
  pathOverlapFraction,
  GraphPath,
  ROUTE_PROFILES,
} from '../src/utils/routing/graphRouter';
import { pathToWaypoints, pathToPolyline } from '../src/utils/routing/graphRouteGenerator';
import { Coordinates } from '../src/types';

// Jamul, CA -> Descanso, CA: the Lyons Valley Road corridor in eastern
// San Diego County that this project was originally tuned for.
const START: Coordinates = { lat: 32.7171, lon: -116.876 };
const END: Coordinates = { lat: 32.8543, lon: -116.6153 };

const ROUTE_COLORS: Record<string, string> = {
  'Twisty Explorer': '#e63946',
  'Balanced Scenic': '#f77f00',
  'Most Direct': '#1d71f2',
  'Twisty Explorer (Alternative)': '#9d4edd',
};

async function main() {
  const outputFile = process.argv[2] || 'demo_routes.svg';

  console.log(`Fetching OSM data for corridor ${START.lat},${START.lon} -> ${END.lat},${END.lon} ...`);
  const osmData = await osmClient.fetchRoadData(START, END);
  if (!osmData) {
    console.error('Failed to fetch OSM data.');
    process.exit(1);
  }

  const graph = buildRoadGraph(osmData);
  console.log(`\nGraph: ${graph.nodes.size} junction nodes, ${graph.edges.size} edges`);

  const snapped = snapEndpointsToSharedComponent(graph, START, END);
  if (!snapped) {
    console.error('Could not snap endpoints to a connected road network.');
    process.exit(1);
  }
  const { startNode, endNode } = snapped;
  console.log(`Snapped start to node ${startNode.id}, end to node ${endNode.id}\n`);

  const routes: { name: string; path: GraphPath }[] = [];

  for (const profile of ROUTE_PROFILES) {
    const path = findBestPath(graph, startNode.id, endNode.id, profile);
    if (!path) {
      console.log(`${profile.name}: no path found`);
      continue;
    }
    if (routes.some(r => pathOverlapFraction(path, r.path) > 0.95)) {
      console.log(`${profile.name}: identical to an existing route, skipped`);
      continue;
    }
    routes.push({ name: profile.name, path });
    describeRoute(profile.name, path);
    const pins = pathToWaypoints(path, profile);
    console.log(`  Pin waypoints (${pins.length}):`);
    pins.forEach(pin =>
      console.log(
        `    - ${pin.location} @ ${pin.coordinates!.lat.toFixed(4)},${pin.coordinates!.lon.toFixed(4)} (twistiness ${pin.twistiness!.toFixed(1)})`
      )
    );
    console.log('');
  }

  // Scenic alternative, as in generateScenicRouteOptions.
  const scenicBase = routes.find(r => r.name === 'Twisty Explorer');
  if (scenicBase) {
    const penalties = new Map<string, number>();
    scenicBase.path.edges.forEach(edge => penalties.set(edge.id, 2.5));
    const profile = ROUTE_PROFILES.find(p => p.name === 'Twisty Explorer')!;
    const alt = findBestPath(graph, startNode.id, endNode.id, profile, penalties);
    if (alt && routes.every(r => pathOverlapFraction(alt, r.path) < 0.7)) {
      routes.push({ name: 'Twisty Explorer (Alternative)', path: alt });
      describeRoute('Twisty Explorer (Alternative)', alt);
      console.log('');
    }
  }

  const svg = renderSvg(graph, routes);
  writeFileSync(outputFile, svg);
  console.log(`Wrote route map to ${outputFile}`);
}

function describeRoute(name: string, path: GraphPath) {
  console.log(`${name}:`);
  console.log(
    `  ${(path.totalLengthMeters / 1000).toFixed(1)} km over ${path.edges.length} edges, ` +
      `average twistiness ${path.averageTwistiness.toFixed(2)}`
  );

  // Aggregate length by displayed road name (names are labels only, never logic).
  const byRoad = new Map<string, number>();
  path.edges.forEach(edge => {
    const label = typeof edge.tags.name === 'string' && edge.tags.name.length > 0
      ? edge.tags.name
      : `(unnamed ${edge.highway})`;
    byRoad.set(label, (byRoad.get(label) || 0) + edge.lengthMeters);
  });
  const top = Array.from(byRoad.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log('  Main roads used:');
  top.forEach(([label, meters]) => console.log(`    - ${label}: ${(meters / 1000).toFixed(1)} km`));
}

function renderSvg(graph: RoadGraph, routes: { name: string; path: GraphPath }[]): string {
  const WIDTH = 1400;
  const HEIGHT = 1000;
  const PADDING = 40;

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  graph.edges.forEach(edge =>
    edge.geometry.forEach(p => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    })
  );

  const scaleX = (WIDTH - 2 * PADDING) / (maxLon - minLon);
  const scaleY = (HEIGHT - 2 * PADDING) / (maxLat - minLat);
  const scale = Math.min(scaleX, scaleY);
  const x = (lon: number) => PADDING + (lon - minLon) * scale;
  const y = (lat: number) => HEIGHT - PADDING - (lat - minLat) * scale;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`
  );
  parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="#fbfbf8"/>`);

  // All graph edges (light gray background network).
  graph.edges.forEach(edge => {
    const points = edge.geometry.map(p => `${x(p.lon).toFixed(1)},${y(p.lat).toFixed(1)}`).join(' ');
    parts.push(`<polyline points="${points}" fill="none" stroke="#d4d4d0" stroke-width="1"/>`);
  });

  // Chosen routes.
  routes.forEach(({ name, path }) => {
    const color = ROUTE_COLORS[name] || '#333';
    const polyline = pathToPolyline(path);
    const points = polyline.map(({ point }) => `${x(point.lon).toFixed(1)},${y(point.lat).toFixed(1)}`).join(' ');
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-opacity="0.75" stroke-linecap="round"/>`
    );
  });

  // Start/end markers.
  parts.push(`<circle cx="${x(START.lon)}" cy="${y(START.lat)}" r="9" fill="#2a9d8f" stroke="#fff" stroke-width="2"/>`);
  parts.push(`<text x="${x(START.lon) + 14}" y="${y(START.lat) + 5}" font-family="sans-serif" font-size="18" fill="#2a9d8f">START (Jamul)</text>`);
  parts.push(`<circle cx="${x(END.lon)}" cy="${y(END.lat)}" r="9" fill="#264653" stroke="#fff" stroke-width="2"/>`);
  parts.push(`<text x="${x(END.lon) - 160}" y="${y(END.lat) - 12}" font-family="sans-serif" font-size="18" fill="#264653">END (Descanso)</text>`);

  // Legend.
  let legendY = 40;
  routes.forEach(({ name, path }) => {
    const color = ROUTE_COLORS[name] || '#333';
    parts.push(`<line x1="40" y1="${legendY}" x2="90" y2="${legendY}" stroke="${color}" stroke-width="5"/>`);
    parts.push(
      `<text x="100" y="${legendY + 5}" font-family="sans-serif" font-size="17" fill="#222">` +
        `${name} — ${(path.totalLengthMeters / 1000).toFixed(1)} km, twistiness ${path.averageTwistiness.toFixed(2)}</text>`
    );
    legendY += 28;
  });

  parts.push('</svg>');
  return parts.join('\n');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
