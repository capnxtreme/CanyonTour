import { buildRoadGraph, findNearestNode } from './roadGraph';
import { findBestPath, ROUTE_PROFILES } from './graphRouter';
import lyonsValleyFixture from '../../services/osm/__fixtures__/lyons_valley.json';
import { buildSyntheticNetwork, NODE_A_ID, NODE_B_ID } from '../../testUtils/syntheticOsm';

const lyonsData = lyonsValleyFixture as { elements: any[] };

describe('buildRoadGraph', () => {
  test('links the segments of a real road via shared node IDs (Lyons Valley fixture)', () => {
    const graph = buildRoadGraph(lyonsData);

    // The fixture contains 10 consecutive OSM ways of Lyons Valley Road.
    expect(graph.edges.size).toBeGreaterThanOrEqual(10);
    expect(graph.nodes.size).toBeGreaterThan(0);

    // Topology (not names) must connect the whole corridor. The fixture ways
    // are unordered, so find the two true corridor terminals: endpoint nodes
    // that belong to exactly one way.
    const ways = lyonsData.elements.filter(e => e.type === 'way');
    const endpointCounts = new Map<number, number>();
    ways.forEach(way => {
      for (const id of [way.nodes[0], way.nodes[way.nodes.length - 1]]) {
        endpointCounts.set(id, (endpointCounts.get(id) || 0) + 1);
      }
    });
    const terminals = Array.from(endpointCounts.entries())
      .filter(([, count]) => count === 1)
      .map(([id]) => id);
    expect(terminals).toHaveLength(2);

    const path = findBestPath(graph, terminals[0], terminals[1], ROUTE_PROFILES[0]);
    expect(path).not.toBeNull();
    expect(path!.edges.length).toBeGreaterThanOrEqual(9);
    expect(path!.totalLengthMeters).toBeGreaterThan(10000); // long corridor
  });

  test('edges carry metadata used by the routing rules', () => {
    const graph = buildRoadGraph(lyonsData);
    graph.edges.forEach(edge => {
      expect(edge.highway).toBe('secondary');
      expect(edge.lengthMeters).toBeGreaterThan(0);
      expect(edge.geometry.length).toBeGreaterThanOrEqual(2);
      expect(edge.tags.surface).toBe('asphalt');
    });
  });

  test('excludes unpaved roads and roads with fewer than 2 lanes from the graph', () => {
    const someNodes = lyonsData.elements.find(e => e.type === 'way').nodes;
    const augmented = {
      elements: [
        ...lyonsData.elements,
        { type: 'way', id: 999901, nodes: someNodes, tags: { highway: 'secondary', surface: 'dirt' } },
        { type: 'way', id: 999902, nodes: someNodes, tags: { highway: 'secondary', surface: 'asphalt', lanes: '1' } },
        { type: 'way', id: 999903, nodes: someNodes, tags: { highway: 'track' } },
      ],
    };

    const graph = buildRoadGraph(augmented);
    graph.edges.forEach(edge => {
      expect([999901, 999902, 999903]).not.toContain(edge.wayId);
    });
  });

  test('findNearestNode snaps to a routable node', () => {
    const graph = buildRoadGraph(lyonsData);
    const anyNode = graph.nodes.values().next().value!;
    const nearest = findNearestNode(graph, { lat: anyNode.lat + 0.001, lon: anyNode.lon + 0.001 });
    expect(nearest).not.toBeNull();
    expect(graph.adjacency.get(nearest!.id)!.length).toBeGreaterThan(0);
  });

  test('is deterministic', () => {
    const a = buildRoadGraph(lyonsData);
    const b = buildRoadGraph(lyonsData);
    expect(Array.from(b.edges.keys())).toEqual(Array.from(a.edges.keys()));
  });
});

describe('buildRoadGraph (synthetic network)', () => {
  test('creates one edge per road between shared endpoints', () => {
    const graph = buildRoadGraph(buildSyntheticNetwork());
    // Two parallel roads, each a single edge between junctions A and B.
    expect(graph.edges.size).toBe(2);
    const adjacencyAtA = graph.adjacency.get(NODE_A_ID)!;
    expect(adjacencyAtA.length).toBe(2);
  });

  test('computes higher twistiness for the zigzag road', () => {
    const graph = buildRoadGraph(buildSyntheticNetwork());
    const edges = Array.from(graph.edges.values());
    const straight = edges.find(e => e.wayId === 1000)!;
    const twisty = edges.find(e => e.wayId === 2000)!;

    expect(straight.twistiness).toBeLessThan(0.5);
    expect(twisty.twistiness).toBeGreaterThan(2);
    expect(twisty.lengthMeters).toBeGreaterThan(straight.lengthMeters);
  });
});

describe('findBestPath (synthetic network)', () => {
  const graph = buildRoadGraph(buildSyntheticNetwork());
  const twistyProfile = ROUTE_PROFILES.find(p => p.name === 'Twisty Explorer')!;
  const directProfile = ROUTE_PROFILES.find(p => p.name === 'Most Direct')!;

  test('Twisty Explorer takes the longer, curvier road', () => {
    const path = findBestPath(graph, NODE_A_ID, NODE_B_ID, twistyProfile);
    expect(path).not.toBeNull();
    expect(path!.edges[0].wayId).toBe(2000);
  });

  test('Most Direct takes the shorter, straighter road', () => {
    const path = findBestPath(graph, NODE_A_ID, NODE_B_ID, directProfile);
    expect(path).not.toBeNull();
    expect(path!.edges[0].wayId).toBe(1000);
  });

  test('never revisits a node (no retraced steps by construction)', () => {
    const path = findBestPath(graph, NODE_A_ID, NODE_B_ID, twistyProfile)!;
    const uniqueNodes = new Set(path.nodeIds);
    expect(uniqueNodes.size).toBe(path.nodeIds.length);
  });

  test('returns null for disconnected nodes', () => {
    const disconnected = buildSyntheticNetwork();
    disconnected.elements.push(
      { type: 'node', id: 900, lat: 40.0, lon: -100.0 },
      { type: 'node', id: 901, lat: 40.1, lon: -100.0 },
      {
        type: 'way',
        id: 3000,
        nodes: [900, 901],
        tags: { highway: 'secondary', surface: 'asphalt' },
      }
    );
    const islandGraph = buildRoadGraph(disconnected);
    expect(findBestPath(islandGraph, NODE_A_ID, 900, twistyProfile)).toBeNull();
  });
});
