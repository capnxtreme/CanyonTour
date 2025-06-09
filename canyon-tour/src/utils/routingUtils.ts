import { Coordinates, SuggestedWaypoint } from "../types";

type RouteStrategy = 'twisty' | 'balanced' | 'direct';

const STRATEGY_CONFIG = {
  twisty: {
    twistinessWeight: 0.7,
    progressWeight: 0.3,
    distanceThreshold: 5,
  },
  balanced: {
    twistinessWeight: 0.5,
    progressWeight: 0.5,
    distanceThreshold: 10,
  },
  direct: {
    twistinessWeight: 0.3,
    progressWeight: 0.7,
    distanceThreshold: 15,
  },
};

export const calculateDistance = (coord1?: { lat: number; lon: number }, coord2?: { lat: number; lon: number }): number => {
    if (!coord1 || !coord2) return 0;
    const R = 6371;
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLon = (coord2.lon - coord1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

export const getStrategicRoutingDescription = (tags: any): string => {
if (!tags) return 'Unknown location';
const descriptions: Record<string, string> = {
    'tertiary': 'Forces routing through narrow tertiary roads with curves and elevation changes',
    'unclassified': 'Strategic routing through unclassified back roads for maximum twistiness',
    'residential': 'Residential area routing to avoid main highways and add road variety',
    'secondary': 'Secondary road routing with moderate twistiness and scenic value',
    'mountain_pass': 'Mountain pass with switchbacks, hairpin turns, and dramatic elevation changes',
    'pass': 'Natural pass forcing routing through twisty mountain terrain',
    'saddle': 'Ridge saddle point creating winding approach roads',
    'hamlet': 'Small settlement forcing routing through local roads',
    'village': 'Village routing to utilize connecting country roads',
    'locality': 'Local area requiring back road navigation'
};
for (const [key, description] of Object.entries(descriptions)) {
    if (tags?.highway === key || tags?.natural === key || tags?.place === key) {
    return description;
    }
}
return 'Strategic routing point designed to force usage of twisty, scenic roads';
};

const optimizeRouteByStrategy = (
  waypoints: SuggestedWaypoint[],
  startCoords: Coordinates,
  endCoords: Coordinates,
  strategy: RouteStrategy
): SuggestedWaypoint[] => {
  const config = STRATEGY_CONFIG[strategy];
  const { twistinessWeight, progressWeight, distanceThreshold } = config;

  const projectToRoute = (point: Coordinates) => {
    const directionVector = {
      lat: endCoords.lat - startCoords.lat,
      lon: endCoords.lon - startCoords.lon,
    };
    const pointVector = {
      lat: point.lat - startCoords.lat,
      lon: point.lon - startCoords.lon,
    };
    const magnitude = directionVector.lat * directionVector.lat + directionVector.lon * directionVector.lon;
    if (magnitude === 0) return 0;
    const dotProduct = pointVector.lat * directionVector.lat + pointVector.lon * directionVector.lon;
    return dotProduct / magnitude;
  };

  const waypointsWithProjection = waypoints
    .map(wp => ({
      ...wp,
      projection: wp.coordinates ? projectToRoute(wp.coordinates) : -1,
    }))
    .filter(wp => wp.projection >= -0.1 && wp.projection <= 1.1); // Allow some leeway

  const directDistance = calculateDistance(startCoords, endCoords);

  let sortedWaypoints = waypointsWithProjection.sort((a, b) => {
    const scoreA = (a.twistiness || 0) * twistinessWeight + a.projection * progressWeight;
    const scoreB = (b.twistiness || 0) * twistinessWeight + b.projection * progressWeight;
    return scoreB - scoreA;
  });

  const optimizedWaypoints: (SuggestedWaypoint & { projection: number })[] = [];
  let lastProjection = 0;

  while (optimizedWaypoints.length < 10 && sortedWaypoints.length > 0) {
    let bestCandidate: (SuggestedWaypoint & { projection: number }) | null = null;
    let bestCandidateIndex = -1;

    for (let i = 0; i < sortedWaypoints.length; i++) {
      const candidate = sortedWaypoints[i];
      if (!candidate.coordinates) continue;

      const distFromStart = calculateDistance(candidate.coordinates, startCoords);
      const distFromEnd = calculateDistance(candidate.coordinates, endCoords);
      if (distFromStart < distanceThreshold || distFromEnd < distanceThreshold) continue;

      const tooCloseToOthers = optimizedWaypoints.some(
        (wp) => calculateDistance(wp.coordinates, candidate.coordinates) < distanceThreshold
      );
      if (tooCloseToOthers) continue;

      if (candidate.projection > lastProjection) {
        bestCandidate = candidate;
        bestCandidateIndex = i;
        break;
      }
    }

    if (bestCandidate) {
      optimizedWaypoints.push(bestCandidate);
      lastProjection = bestCandidate.projection;
      sortedWaypoints.splice(bestCandidateIndex, 1);
    } else {
      break;
    }
  }

  const finalWaypoints = optimizedWaypoints
    .sort((a, b) => a.projection - b.projection)
    .map(({ projection, ...wp }) => wp);

  return finalWaypoints;
};

export const generateRouteOptions = (
  waypoints: SuggestedWaypoint[],
  startCoords: Coordinates,
  endCoords: Coordinates
) => {
  console.log('4. Generating route options...');

  const twistyWaypoints = optimizeRouteByStrategy(waypoints, startCoords, endCoords, 'twisty');

  const remainingAfterTwisty = waypoints.filter(
    (wp) => !twistyWaypoints.some((twp) => twp.id === wp.id)
  );

  const balancedWaypoints = optimizeRouteByStrategy(remainingAfterTwisty, startCoords, endCoords, 'balanced');

  const remainingAfterBalanced = remainingAfterTwisty.filter(
    (wp) => !balancedWaypoints.some((bwp) => bwp.id === wp.id)
  );
  
  const directWaypoints = optimizeRouteByStrategy(remainingAfterBalanced, startCoords, endCoords, 'direct');

  const finalOptions = [
    { name: 'Most Twisty', waypoints: twistyWaypoints.slice(0, 10) },
    { name: 'Balanced', waypoints: balancedWaypoints.slice(0, 10) },
    { name: 'Direct & Scenic', waypoints: directWaypoints.slice(0, 10) },
  ].filter(option => option.waypoints.length > 2); // Ensure options have a minimum number of waypoints

  console.log('  - ✅ Route option generation complete. Found:', finalOptions.length, 'options');
  return finalOptions;
};

export const optimizeForTwistyRouting = (waypoints: SuggestedWaypoint[], startCoords: Coordinates, endCoords: Coordinates): SuggestedWaypoint[] => {
  console.warn("DEPRECATED: optimizeForTwistyRouting is deprecated. Use generateRouteOptions instead.");
  return optimizeRouteByStrategy(waypoints, startCoords, endCoords, 'balanced');
};

