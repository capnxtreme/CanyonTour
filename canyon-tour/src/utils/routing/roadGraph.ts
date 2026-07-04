import { Coordinates } from '../../types';
import { calculateDistance } from './geoUtils';
import { getRoadSuitability } from '../../services/osm/roadSuitability';
import { twistinessCalculator } from '../../services/osm/twistinessCalculator';

/**
 * Topology-based road graph built from raw OSM (Overpass) data.
 *
 * OSM ways share node IDs at intersections, so connectivity comes from the
 * data itself — no street-name matching. Each way is split into edges at
 * junction nodes (nodes used by more than one way, or way endpoints), and
 * every edge carries the metadata the routing rules key on: road class,
 * lanes, speed limit, surface, and geometry-derived twistiness.
 */

export interface GraphNode {
  id: number;
  lat: number;
  lon: number;
}

export interface GraphEdge {
  id: string;
  wayId: number;
  from: number;
  to: number;
  /** Full node geometry from `from` to `to`, for twistiness + waypoint emission. */
  geometry: Coordinates[];
  lengthMeters: number;
  /** 0..8 geometry-derived curvature score. */
  twistiness: number;
  highway: string;
  tags: Record<string, any>;
  /** Extra cost weight from suitability penalties (rough surface, tight width). */
  penalty: number;
}

export interface AdjacencyEntry {
  edgeId: string;
  neighbor: number;
}

export interface RoadGraph {
  nodes: Map<number, GraphNode>;
  edges: Map<string, GraphEdge>;
  adjacency: Map<number, AdjacencyEntry[]>;
}

/** Road classes we are willing to drive on (rules exclude tracks/paths/etc.). */
const DRIVABLE_HIGHWAYS = new Set([
  'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
  'primary_link', 'secondary_link', 'tertiary_link',
]);

export function buildRoadGraph(osmData: { elements: any[] }): RoadGraph {
  const nodes = new Map<number, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const adjacency = new Map<number, AdjacencyEntry[]>();

  const nodeCoords = new Map<number, Coordinates>();
  for (const element of osmData.elements) {
    if (element.type === 'node') {
      nodeCoords.set(element.id, { lat: element.lat, lon: element.lon });
    }
  }

  // Keep only ways that pass the hard suitability rules (paved, >=2 lanes,
  // public access, drivable class).
  const suitableWays = osmData.elements.filter((element: any) => {
    if (element.type !== 'way' || !element.tags || !Array.isArray(element.nodes)) return false;
    if (!DRIVABLE_HIGHWAYS.has(element.tags.highway)) return false;
    return !getRoadSuitability(element.tags).exclude;
  });

  // Junction detection: a node used by 2+ suitable ways, or used twice within
  // one way (self-intersection/loop), is a graph vertex. Way endpoints always are.
  const nodeUsage = new Map<number, number>();
  for (const way of suitableWays) {
    for (const nodeId of way.nodes) {
      nodeUsage.set(nodeId, (nodeUsage.get(nodeId) || 0) + 1);
    }
  }

  const isJunction = (nodeId: number) => (nodeUsage.get(nodeId) || 0) >= 2;

  const addAdjacency = (from: number, to: number, edgeId: string) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ edgeId, neighbor: to });
  };

  for (const way of suitableWays) {
    const wayNodes: number[] = way.nodes.filter((id: number) => nodeCoords.has(id));
    if (wayNodes.length < 2) continue;

    const suitability = getRoadSuitability(way.tags);
    const oneway = parseOneway(way.tags);

    // Split the way into segments at junction nodes.
    let segmentStart = 0;
    for (let i = 1; i < wayNodes.length; i++) {
      const isLast = i === wayNodes.length - 1;
      if (!isLast && !isJunction(wayNodes[i])) continue;

      const segmentNodeIds = wayNodes.slice(segmentStart, i + 1);
      segmentStart = i;
      if (segmentNodeIds.length < 2) continue;

      const geometry = segmentNodeIds.map(id => nodeCoords.get(id)!);
      let lengthMeters = 0;
      for (let j = 0; j < geometry.length - 1; j++) {
        lengthMeters += calculateDistance(geometry[j], geometry[j + 1]);
      }
      if (lengthMeters === 0) continue;

      const nodeMap = new Map(segmentNodeIds.map(id => [id, nodeCoords.get(id)!]));
      const { twistiness } = twistinessCalculator.calculateWayTwistiness(segmentNodeIds, nodeMap);

      const fromId = segmentNodeIds[0];
      const toId = segmentNodeIds[segmentNodeIds.length - 1];
      const edgeId = `${way.id}:${segmentNodeIds[0]}-${toId}:${edges.size}`;

      const edge: GraphEdge = {
        id: edgeId,
        wayId: way.id,
        from: fromId,
        to: toId,
        geometry,
        lengthMeters,
        twistiness,
        highway: way.tags.highway,
        tags: way.tags,
        penalty: suitability.penaltyScore,
      };
      edges.set(edgeId, edge);

      for (const nodeId of [fromId, toId]) {
        if (!nodes.has(nodeId)) {
          const coords = nodeCoords.get(nodeId)!;
          nodes.set(nodeId, { id: nodeId, lat: coords.lat, lon: coords.lon });
        }
      }

      if (oneway === 'reverse') {
        addAdjacency(toId, fromId, edgeId);
      } else if (oneway === 'forward') {
        addAdjacency(fromId, toId, edgeId);
      } else {
        addAdjacency(fromId, toId, edgeId);
        addAdjacency(toId, fromId, edgeId);
      }
    }
  }

  return { nodes, edges, adjacency };
}

function parseOneway(tags: Record<string, any>): 'no' | 'forward' | 'reverse' {
  const oneway = tags.oneway;
  if (oneway === 'yes' || oneway === 'true' || oneway === '1') return 'forward';
  if (oneway === '-1' || oneway === 'reverse') return 'reverse';
  return 'no';
}

/**
 * Finds the graph node closest to the given coordinates. Only considers nodes
 * that participate in at least one edge, so the result is always routable.
 * Optionally restricted to a set of allowed node IDs.
 */
export function findNearestNode(
  graph: RoadGraph,
  target: Coordinates,
  allowedNodes?: Set<number>
): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDistance = Infinity;

  graph.adjacency.forEach((entries, nodeId) => {
    if (entries.length === 0) return;
    if (allowedNodes && !allowedNodes.has(nodeId)) return;
    const node = graph.nodes.get(nodeId);
    if (!node) return;
    const distance = calculateDistance({ lat: node.lat, lon: node.lon }, target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  });

  return best;
}

/**
 * Labels every routable node with an (undirected) connected-component ID.
 * Returns the component map plus component sizes.
 */
export function computeComponents(graph: RoadGraph): {
  componentOf: Map<number, number>;
  componentSizes: Map<number, number>;
} {
  const componentOf = new Map<number, number>();
  const componentSizes = new Map<number, number>();
  let componentId = 0;

  graph.adjacency.forEach((_, rootId) => {
    if (componentOf.has(rootId)) return;
    const queue = [rootId];
    componentOf.set(rootId, componentId);
    let size = 0;
    while (queue.length > 0) {
      const current = queue.pop()!;
      size++;
      for (const { neighbor } of graph.adjacency.get(current) || []) {
        if (!componentOf.has(neighbor)) {
          componentOf.set(neighbor, componentId);
          queue.push(neighbor);
        }
      }
    }
    componentSizes.set(componentId, size);
    componentId++;
  });

  return { componentOf, componentSizes };
}

/**
 * Snaps start and end to nodes that are guaranteed to lie in the SAME
 * connected component, choosing the component that minimizes the combined
 * snap distance. This prevents an endpoint from latching onto a tiny
 * disconnected island (e.g. a gated residential stub) that happens to be
 * geographically closest, which would make routing impossible.
 */
export function snapEndpointsToSharedComponent(
  graph: RoadGraph,
  start: Coordinates,
  end: Coordinates
): { startNode: GraphNode; endNode: GraphNode } | null {
  const { componentOf, componentSizes } = computeComponents(graph);
  if (componentSizes.size === 0) return null;

  // Track, per component, the nearest node to each endpoint. Minimizing the
  // combined snap distance naturally rejects small islands: a fragment near
  // one endpoint is necessarily far from the other.
  const nearestToStart = new Map<number, { node: GraphNode; distance: number }>();
  const nearestToEnd = new Map<number, { node: GraphNode; distance: number }>();

  graph.adjacency.forEach((entries, nodeId) => {
    if (entries.length === 0) return;
    const component = componentOf.get(nodeId);
    if (component === undefined) return;

    const node = graph.nodes.get(nodeId);
    if (!node) return;
    const coords = { lat: node.lat, lon: node.lon };

    const startDistance = calculateDistance(coords, start);
    const bestStart = nearestToStart.get(component);
    if (!bestStart || startDistance < bestStart.distance) {
      nearestToStart.set(component, { node, distance: startDistance });
    }

    const endDistance = calculateDistance(coords, end);
    const bestEnd = nearestToEnd.get(component);
    if (!bestEnd || endDistance < bestEnd.distance) {
      nearestToEnd.set(component, { node, distance: endDistance });
    }
  });

  let bestStartNode: GraphNode | null = null;
  let bestEndNode: GraphNode | null = null;
  let bestCombined = Infinity;
  nearestToStart.forEach((startCandidate, component) => {
    const endCandidate = nearestToEnd.get(component);
    if (!endCandidate) return;
    if (startCandidate.node.id === endCandidate.node.id) return;
    const combined = startCandidate.distance + endCandidate.distance;
    if (combined < bestCombined) {
      bestStartNode = startCandidate.node;
      bestEndNode = endCandidate.node;
      bestCombined = combined;
    }
  });

  return bestStartNode && bestEndNode
    ? { startNode: bestStartNode, endNode: bestEndNode }
    : null;
}
