/**
 * Builds a small synthetic OSM network with two alternative roads between a
 * shared west endpoint (A) and east endpoint (B):
 *
 *  - "Straight Road": ~9.3 km direct secondary road with no curves.
 *  - "Twisty Road": ~14.5 km zigzag secondary road with high twistiness.
 *
 * Node IDs: A = 1, B = 2, straight road interior = 100.., twisty = 200..
 */

const WEST_LON = -116.9;
const EAST_LON = -116.8;
const BASE_LAT = 32.7;

export const NODE_A_ID = 1;
export const NODE_B_ID = 2;

export function buildSyntheticNetwork(): { elements: any[] } {
  const elements: any[] = [];

  const addNode = (id: number, lat: number, lon: number) => {
    elements.push({ type: 'node', id, lat, lon });
  };

  addNode(NODE_A_ID, BASE_LAT, WEST_LON);
  addNode(NODE_B_ID, BASE_LAT, EAST_LON);

  // Straight road: evenly spaced nodes along the direct line.
  const straightNodeIds = [NODE_A_ID];
  for (let i = 1; i <= 4; i++) {
    const id = 100 + i;
    addNode(id, BASE_LAT, WEST_LON + (EAST_LON - WEST_LON) * (i / 5));
    straightNodeIds.push(id);
  }
  straightNodeIds.push(NODE_B_ID);

  elements.push({
    type: 'way',
    id: 1000,
    nodes: straightNodeIds,
    tags: {
      highway: 'secondary',
      lanes: '2',
      surface: 'asphalt',
      maxspeed: '55 mph',
      name: 'Straight Road',
    },
  });

  // Twisty road: zigzag between BASE_LAT and BASE_LAT + 0.01 every 0.01 lon.
  const twistyNodeIds = [NODE_A_ID];
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const id = 200 + i;
    const lat = BASE_LAT + (i % 2 === 1 ? 0.01 : 0);
    addNode(id, lat, WEST_LON + (EAST_LON - WEST_LON) * (i / steps));
    twistyNodeIds.push(id);
  }
  twistyNodeIds.push(NODE_B_ID);

  elements.push({
    type: 'way',
    id: 2000,
    nodes: twistyNodeIds,
    tags: {
      highway: 'secondary',
      lanes: '2',
      surface: 'asphalt',
      maxspeed: '55 mph',
      name: 'Twisty Road',
    },
  });

  return { elements };
}

/**
 * Three parallel corridors so edge-penalized alternatives can diverge:
 * straight (shortest), medium-curve, and high-twistiness.
 */
export function buildSyntheticNetworkWithAlternatives(): { elements: any[] } {
  const elements: any[] = [];

  const addNode = (id: number, lat: number, lon: number) => {
    elements.push({ type: 'node', id, lat, lon });
  };

  addNode(NODE_A_ID, BASE_LAT, WEST_LON);
  addNode(NODE_B_ID, BASE_LAT, EAST_LON);

  const straightNodeIds = [NODE_A_ID];
  for (let i = 1; i <= 4; i++) {
    const id = 100 + i;
    addNode(id, BASE_LAT, WEST_LON + (EAST_LON - WEST_LON) * (i / 5));
    straightNodeIds.push(id);
  }
  straightNodeIds.push(NODE_B_ID);
  elements.push({
    type: 'way',
    id: 1000,
    nodes: straightNodeIds,
    tags: {
      highway: 'secondary',
      lanes: '2',
      surface: 'asphalt',
      maxspeed: '55 mph',
      name: 'Straight Road',
    },
  });

  // Medium corridor: gentle north offset.
  const mediumNodeIds = [NODE_A_ID];
  for (let i = 1; i < 8; i++) {
    const id = 300 + i;
    const lat = BASE_LAT + (i % 2 === 1 ? 0.004 : 0);
    addNode(id, lat, WEST_LON + (EAST_LON - WEST_LON) * (i / 8));
    mediumNodeIds.push(id);
  }
  mediumNodeIds.push(NODE_B_ID);
  elements.push({
    type: 'way',
    id: 3000,
    nodes: mediumNodeIds,
    tags: {
      highway: 'secondary',
      lanes: '2',
      surface: 'asphalt',
      maxspeed: '55 mph',
      name: 'Medium Road',
    },
  });

  // High-twistiness corridor: large zigzag.
  const twistyNodeIds = [NODE_A_ID];
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const id = 200 + i;
    const lat = BASE_LAT + (i % 2 === 1 ? 0.012 : 0);
    addNode(id, lat, WEST_LON + (EAST_LON - WEST_LON) * (i / steps));
    twistyNodeIds.push(id);
  }
  twistyNodeIds.push(NODE_B_ID);
  elements.push({
    type: 'way',
    id: 2000,
    nodes: twistyNodeIds,
    tags: {
      highway: 'secondary',
      lanes: '2',
      surface: 'asphalt',
      maxspeed: '55 mph',
      name: 'Twisty Road',
    },
  });

  return { elements };
}
