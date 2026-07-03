import { Coordinates, RouteOption, SuggestedWaypoint } from '../../types';
import { buildRoadGraph, findNearestNode, RoadGraph } from './roadGraph';
import { findBestPath, pathOverlapFraction, GraphPath, ROUTE_PROFILES, RouteProfile } from './graphRouter';
import { calculateDistance, getStrategicRoutingDescription } from './geoUtils';
import { getDirections, DirectionsOptions } from '../../services/googleMapsService';
import { analyzeRouteForOutAndBack, calculateRouteContinuity } from './routeAnalysis';

/**
 * Graph-based route generation:
 *
 * 1. Build a topology road graph from raw Overpass data (shared node IDs).
 * 2. For each profile, run a cost-based shortest path where scenic roads
 *    are cheap and boring roads are expensive.
 * 3. Emit evenly spaced pin waypoints along the chosen path so Google Maps
 *    is forced to drive the roads the algorithm actually selected.
 * 4. Fetch real directions per option and rank the results.
 */

const MAX_WAYPOINTS = 10;
/** Don't pin within this distance of start/end; Google handles the approach. */
const ENDPOINT_CLEARANCE_METERS = 1500;
/** Snap-to-graph sanity limit: beyond this the OSM data doesn't cover the trip. */
const MAX_SNAP_DISTANCE_METERS = 30000;
/** Alternatives sharing more than this fraction of an existing route are dropped. */
const MAX_OVERLAP_FRACTION = 0.7;

export async function generateScenicRouteOptions(
  osmData: { elements: any[] },
  start: Coordinates,
  end: Coordinates,
  directionsOptions: DirectionsOptions = {}
): Promise<RouteOption[]> {
  const graph = buildRoadGraph(osmData);
  if (graph.edges.size === 0) {
    console.warn('Road graph is empty — no suitable roads in the area.');
    return [];
  }

  const startNode = findNearestNode(graph, start);
  const endNode = findNearestNode(graph, end);
  if (!startNode || !endNode || startNode.id === endNode.id) {
    console.warn('Could not snap start/end to the road graph.');
    return [];
  }
  const startSnapDistance = calculateDistance(start, { lat: startNode.lat, lon: startNode.lon });
  const endSnapDistance = calculateDistance(end, { lat: endNode.lat, lon: endNode.lon });
  if (startSnapDistance > MAX_SNAP_DISTANCE_METERS || endSnapDistance > MAX_SNAP_DISTANCE_METERS) {
    console.warn('Start or end is too far from any suitable road in the fetched area.');
    return [];
  }

  const paths: { profile: RouteProfile; path: GraphPath; nameSuffix?: string }[] = [];

  for (const profile of ROUTE_PROFILES) {
    const path = findBestPath(graph, startNode.id, endNode.id, profile);
    if (!path) continue;
    // Skip profiles that resolve to (almost) the same road choice as one we have.
    const isDuplicate = paths.some(existing => pathOverlapFraction(path, existing.path) > 0.95);
    if (!isDuplicate) {
      paths.push({ profile, path });
    }
  }

  if (paths.length === 0) {
    console.warn('No path found between start and end in the road graph.');
    return [];
  }

  // Generate a genuinely different scenic alternative by penalizing the edges
  // of the best scenic path and re-routing.
  const scenicBase = paths.find(p => p.profile.name === 'Twisty Explorer') ?? paths[0];
  const penalties = new Map<string, number>();
  scenicBase.path.edges.forEach(edge => penalties.set(edge.id, 2.5));
  const alternativePath = findBestPath(graph, startNode.id, endNode.id, scenicBase.profile, penalties);
  if (
    alternativePath &&
    paths.every(existing => pathOverlapFraction(alternativePath, existing.path) < MAX_OVERLAP_FRACTION)
  ) {
    paths.push({ profile: scenicBase.profile, path: alternativePath, nameSuffix: ' (Alternative)' });
  }

  const options: RouteOption[] = [];
  for (const { profile, path, nameSuffix } of paths) {
    const waypoints = pathToWaypoints(path, profile);
    const waypointCoords = waypoints.map(wp => wp.coordinates!);
    const directions = await getDirections(start, end, waypointCoords, directionsOptions);
    if (!directions) {
      console.warn(`Could not fetch directions for ${profile.name}.`);
      continue;
    }

    const routeAnalysis = analyzeRouteForOutAndBack(directions);
    const continuityScore = calculateRouteContinuity(directions);
    const totalDistance = directions.routes[0].legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
    const totalDuration = directions.routes[0].legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);

    options.push({
      name: `${profile.name}${nameSuffix ?? ''}`,
      strategy: profile.name,
      description:
        `${profile.description} ${(path.totalLengthMeters / 1000).toFixed(0)} km of selected roads, ` +
        `average twistiness ${path.averageTwistiness.toFixed(1)}.`,
      waypoints,
      distance: totalDistance / 1000,
      duration: totalDuration / 60,
      directions,
      continuityScore,
      routeAnalysis,
      totalTwistiness: path.averageTwistiness,
    });
  }

  // Rank scenic quality first; keep "Most Direct" available as a baseline.
  options.sort((a, b) => rankRoute(b) - rankRoute(a));
  return options;
}

function rankRoute(option: RouteOption): number {
  const twistiness = option.totalTwistiness || 0;
  const continuity = option.continuityScore || 0.5;
  return twistiness * 3 + continuity * 10;
}

/**
 * Builds the oriented polyline of a path, honoring edge direction, and keeps
 * a reference to the edge that produced each polyline point.
 */
export function pathToPolyline(path: GraphPath): { point: Coordinates; edgeIndex: number }[] {
  const polyline: { point: Coordinates; edgeIndex: number }[] = [];

  path.edges.forEach((edge, edgeIndex) => {
    const entryNode = path.nodeIds[edgeIndex];
    const oriented = edge.from === entryNode ? edge.geometry : [...edge.geometry].reverse();
    // Skip the first point of subsequent edges (same as previous edge's last point).
    const points = edgeIndex === 0 ? oriented : oriented.slice(1);
    points.forEach(point => polyline.push({ point, edgeIndex }));
  });

  return polyline;
}

/**
 * Samples evenly spaced pin waypoints along a path so Google Maps follows it.
 */
export function pathToWaypoints(path: GraphPath, profile: RouteProfile): SuggestedWaypoint[] {
  const polyline = pathToPolyline(path);
  if (polyline.length < 2) return [];

  // Cumulative distance along the polyline.
  const cumulative: number[] = [0];
  for (let i = 1; i < polyline.length; i++) {
    cumulative.push(
      cumulative[i - 1] + calculateDistance(polyline[i - 1].point, polyline[i].point)
    );
  }
  const totalLength = cumulative[cumulative.length - 1];
  if (totalLength === 0) return [];

  // One pin per ~6 km keeps Google glued to the path without exceeding limits.
  const pinCount = Math.min(MAX_WAYPOINTS, Math.max(1, Math.round(totalLength / 6000)));

  const waypoints: SuggestedWaypoint[] = [];
  const usedIndices = new Set<number>();

  for (let i = 1; i <= pinCount; i++) {
    const targetDistance = (totalLength * i) / (pinCount + 1);
    if (
      targetDistance < ENDPOINT_CLEARANCE_METERS ||
      totalLength - targetDistance < ENDPOINT_CLEARANCE_METERS
    ) {
      continue;
    }

    // Closest polyline vertex to the target distance (vertices are real road
    // geometry, so pins always sit on the selected road).
    let index = cumulative.findIndex(d => d >= targetDistance);
    if (index === -1) index = polyline.length - 1;
    if (usedIndices.has(index)) continue;
    usedIndices.add(index);

    const { point, edgeIndex } = polyline[index];
    const edge = path.edges[edgeIndex];
    const roadName = typeof edge.tags.name === 'string' && edge.tags.name.length > 0
      ? edge.tags.name
      : `${edge.highway} road`;

    waypoints.push({
      id: `graph-${profile.name}-${i}`,
      location: roadName,
      description: getStrategicRoutingDescription(edge.tags),
      checked: true,
      type: 'strategic_routing',
      coordinates: { lat: point.lat, lon: point.lon },
      roadType: edge.highway,
      twistiness: edge.twistiness,
      tags: edge.tags,
    });
  }

  return waypoints;
}

export type { RoadGraph };
