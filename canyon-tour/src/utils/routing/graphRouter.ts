import { RoadGraph, GraphEdge } from './roadGraph';

/**
 * Cost-based routing over the OSM road graph.
 *
 * Each profile expresses the routing rules as edge-cost multipliers:
 * desirable roads (twisty, secondary, 2-lane, 45-65 mph) cost *less* than
 * their physical length, so the shortest-cost path naturally detours onto
 * them; undesirable roads cost more. Hard exclusions (unpaved, <2 lanes)
 * never make it into the graph at all.
 *
 * Because Dijkstra never revisits a settled node, a path can never retrace
 * itself — the "no out-and-back" rule is guaranteed by construction instead
 * of being detected and rejected after the fact.
 */

export interface RouteProfile {
  name: string;
  description: string;
  /** 0..1 — max cost discount earned by maximum twistiness. */
  twistinessWeight: number;
  /** Cost multiplier per OSM highway class (unlisted classes get 1.2). */
  highwayMultipliers: Record<string, number>;
  /** Multiplier applied to nearly straight edges (twistiness < 0.3). */
  straightPenalty: number;
  /** Multiplier for edges with a 45-65 mph speed limit. */
  idealSpeedMultiplier: number;
  /** Multiplier for 2-lane edges. */
  twoLaneMultiplier: number;
}

export const ROUTE_PROFILES: RouteProfile[] = [
  {
    name: 'Twisty Explorer',
    description: 'Maximizes curvy 2-lane secondary roads, accepting longer detours.',
    // Strong curvature discount + heavy straight-road penalty so this profile
    // will take a longer corridor when a twistier one exists.
    twistinessWeight: 0.7,
    highwayMultipliers: { secondary: 0.5, tertiary: 0.65, unclassified: 0.8, residential: 1.6, primary: 1.35 },
    straightPenalty: 1.6,
    idealSpeedMultiplier: 0.8,
    twoLaneMultiplier: 0.85,
  },
  {
    name: 'Balanced Scenic',
    description: 'Prefers scenic roads with a moderate detour budget.',
    twistinessWeight: 0.4,
    highwayMultipliers: { secondary: 0.75, tertiary: 0.85, unclassified: 0.95, residential: 1.25, primary: 1.05 },
    straightPenalty: 1.2,
    idealSpeedMultiplier: 0.9,
    twoLaneMultiplier: 0.92,
  },
  {
    name: 'Most Direct',
    description: 'Shortest allowed route (still avoids unpaved and narrow roads).',
    // Pure length, but gently prefer higher-class roads so Direct doesn't
    // collapse onto the same secondary corridor as Twisty by accident.
    twistinessWeight: 0,
    highwayMultipliers: { secondary: 1.05, tertiary: 1.05, unclassified: 1.1, residential: 1.2, primary: 0.95 },
    straightPenalty: 1,
    idealSpeedMultiplier: 1,
    twoLaneMultiplier: 1,
  },
];

export interface GraphPath {
  edges: GraphEdge[];
  /** Node IDs visited, in order (length = edges.length + 1). */
  nodeIds: number[];
  totalLengthMeters: number;
  /** Length-weighted average twistiness of the path. */
  averageTwistiness: number;
}

export function edgeCost(edge: GraphEdge, profile: RouteProfile, edgePenalties?: Map<string, number>): number {
  let multiplier = profile.highwayMultipliers[edge.highway] ?? 1.2;

  const twistinessFactor = Math.min(edge.twistiness, 4) / 4; // 0..1
  multiplier *= 1 - profile.twistinessWeight * twistinessFactor;

  if (edge.twistiness < 0.3) {
    multiplier *= profile.straightPenalty;
  }

  const speedMph = parseMaxSpeedMph(edge.tags.maxspeed);
  if (speedMph !== null && speedMph >= 45 && speedMph <= 65) {
    multiplier *= profile.idealSpeedMultiplier;
  }

  const lanes = parseInt(edge.tags.lanes, 10);
  if (lanes === 2) {
    multiplier *= profile.twoLaneMultiplier;
  }

  // Soft suitability penalties (rough surface, tight width restrictions).
  multiplier += edge.penalty * 0.1;

  // Penalty used to force alternative routes away from already-used edges.
  const extraPenalty = edgePenalties?.get(edge.id) ?? 1;

  // Keep costs strictly positive and bounded below so search always terminates.
  return edge.lengthMeters * Math.max(multiplier, 0.2) * extraPenalty;
}

export function parseMaxSpeedMph(maxspeed: unknown): number | null {
  if (typeof maxspeed !== 'string' || maxspeed.length === 0) return null;
  const match = maxspeed.match(/(\d+)/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (isNaN(value)) return null;
  // OSM maxspeed without units is km/h; "NN mph" is miles per hour.
  return /mph/i.test(maxspeed) ? value : value * 0.621371;
}

interface QueueEntry {
  nodeId: number;
  cost: number;
}

/** Minimal binary min-heap keyed on cost. */
class MinHeap {
  private items: QueueEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: QueueEntry): void {
    this.items.push(entry);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].cost <= this.items[i].cost) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): QueueEntry | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < this.items.length && this.items[left].cost < this.items[smallest].cost) smallest = left;
        if (right < this.items.length && this.items[right].cost < this.items[smallest].cost) smallest = right;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Dijkstra shortest-cost path between two graph nodes under a profile.
 * Returns null when start and end are not connected.
 *
 * @param edgePenalties optional per-edge multipliers (>1) used to push
 *   alternative routes away from edges already used by earlier routes.
 */
export function findBestPath(
  graph: RoadGraph,
  startNodeId: number,
  endNodeId: number,
  profile: RouteProfile,
  edgePenalties?: Map<string, number>
): GraphPath | null {
  const distances = new Map<number, number>();
  const previous = new Map<number, { nodeId: number; edgeId: string }>();
  const settled = new Set<number>();
  const heap = new MinHeap();

  distances.set(startNodeId, 0);
  heap.push({ nodeId: startNodeId, cost: 0 });

  while (heap.size > 0) {
    const current = heap.pop()!;
    if (settled.has(current.nodeId)) continue;
    settled.add(current.nodeId);

    if (current.nodeId === endNodeId) break;

    const neighbors = graph.adjacency.get(current.nodeId) || [];
    for (const { edgeId, neighbor } of neighbors) {
      if (settled.has(neighbor)) continue;
      const edge = graph.edges.get(edgeId)!;
      const cost = current.cost + edgeCost(edge, profile, edgePenalties);
      if (cost < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, cost);
        previous.set(neighbor, { nodeId: current.nodeId, edgeId });
        heap.push({ nodeId: neighbor, cost });
      }
    }
  }

  if (!previous.has(endNodeId) && startNodeId !== endNodeId) {
    return null;
  }

  // Reconstruct path from end to start.
  const edges: GraphEdge[] = [];
  const nodeIds: number[] = [endNodeId];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const step = previous.get(cursor);
    if (!step) return null;
    edges.unshift(graph.edges.get(step.edgeId)!);
    nodeIds.unshift(step.nodeId);
    cursor = step.nodeId;
  }

  const totalLengthMeters = edges.reduce((sum, edge) => sum + edge.lengthMeters, 0);
  const weightedTwistiness = edges.reduce(
    (sum, edge) => sum + edge.twistiness * edge.lengthMeters,
    0
  );

  return {
    edges,
    nodeIds,
    totalLengthMeters,
    averageTwistiness: totalLengthMeters > 0 ? weightedTwistiness / totalLengthMeters : 0,
  };
}

/**
 * Fraction of `a`'s edges (by length) that also appear in `b`.
 * Used to discard alternative routes that are not meaningfully different.
 */
export function pathOverlapFraction(a: GraphPath, b: GraphPath): number {
  if (a.totalLengthMeters === 0) return 1;
  const bEdgeIds = new Set(b.edges.map(edge => edge.id));
  const sharedLength = a.edges
    .filter(edge => bEdgeIds.has(edge.id))
    .reduce((sum, edge) => sum + edge.lengthMeters, 0);
  return sharedLength / a.totalLengthMeters;
}
