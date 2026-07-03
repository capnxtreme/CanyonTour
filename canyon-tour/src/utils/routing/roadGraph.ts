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
 */
export function findNearestNode(graph: RoadGraph, target: Coordinates): GraphNode | null {
  let best: GraphNode | null = null;
  let bestDistance = Infinity;

  graph.adjacency.forEach((entries, nodeId) => {
    if (entries.length === 0) return;
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
