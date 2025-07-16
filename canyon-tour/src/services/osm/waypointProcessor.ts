import { SuggestedWaypoint, Coordinates } from '../../types';
import { calculateDistance, getStrategicRoutingDescription } from '../../utils/routing/geoUtils';
import { getRoadSuitability } from './roadSuitability';
import { twistinessCalculator } from './twistinessCalculator';
import { linkRoadSegments, createStrategicWaypointsFromLinkedRoads } from '../../utils/routing/roadSegmentLinker';

export function processOsmData(
  osmData: { elements: any[] },
  startCoords: Coordinates,
  endCoords: Coordinates
): SuggestedWaypoint[] {
  console.log(`  - Processing ${osmData.elements.length} OSM elements...`);

  // Create a mapping of node IDs to their coordinates for way processing
  const nodeMap = new Map();
  osmData.elements
    .filter((element: any) => element.type === 'node')
    .forEach((node: any) => {
      nodeMap.set(node.id, { lat: node.lat, lon: node.lon });
    });

  console.log(`  - Created node map with ${nodeMap.size} nodes.`);

  // Filter and process ways (roads)
  const validElements = osmData.elements.filter((element: any) => {
    if (element.type !== 'way' || !element.tags || !element.nodes) {
      return false;
    }

    // Calculate a representative point for the way (center or first node)
    let lat: number, lon: number;
    if (element.lat && element.lon) {
      lat = element.lat;
      lon = element.lon;
    } else if (element.nodes && element.nodes.length > 0) {
      const firstNode = nodeMap.get(element.nodes[0]);
      if (!firstNode) return false;
      lat = firstNode.lat;
      lon = firstNode.lon;
    } else {
      return false;
    }

    element.lat = lat;
    element.lon = lon;
    return true;
  });

  console.log(`  - Filtered to ${validElements.length} valid road elements.`);

  const waypoints = validElements.map((element: any) => {
    try {
      // Generate a more Google Directions friendly name
      let name = '';
      if (element.tags?.name) {
        name = element.tags.name;
      } else if (element.tags?.ref) {
        name = `${element.tags.highway || 'Road'} ${element.tags.ref}`;
      } else {
        name = `${element.tags?.highway || 'Road'} at ${element.lat.toFixed(4)}, ${element.lon.toFixed(4)}`;
      }

      // Check road suitability (exclusion and penalties)
      const suitability = getRoadSuitability(element.tags, name);

      if (suitability.exclude) {
        // console.log(`  - EXCLUDING ROAD: ${name}, Reasons: ${suitability.reasons.join(', ')}`);
        return null; // This will be filtered out
      }

      const lat = element.lat;
      const lon = element.lon;

      // Calculate twistiness based on road characteristics
      let twistiness = 0;

      if (element.type === 'way' && element.nodes) {
        const result = twistinessCalculator.calculateWayTwistiness(element.nodes, nodeMap);
        twistiness = result.twistiness;
        
        // Secondary roads get a minimum baseline twistiness since they're our priority
        // OSM geometry might not capture all the curves, but secondary roads are usually scenic
        if (element.tags?.highway === 'secondary' && twistiness < 0.8) {
          twistiness = Math.max(twistiness, 0.8); // Ensure minimum baseline for secondary roads
        }
      }

      // Add a small bonus for a good surface type
      if (element.tags?.surface) {
        if (['asphalt', 'paved'].includes(element.tags.surface)) {
          twistiness += 0.2;
        }
      }

      // Special bonus for 2-lane secondary roads - these are exactly what we're looking for
      if (element.tags?.highway === 'secondary' && element.tags?.lanes === '2') {
        twistiness += 0.8; // Significant bonus for 2-lane secondary roads
      } else if (element.tags?.highway === 'secondary') {
        // Even secondary roads without explicit lane count deserve a bonus - assume they're likely 2-lane
        twistiness += 0.5; // Moderate bonus for secondary roads without explicit lane info
      }

      // Bonus for ideal speed limits (45-65mph are perfect for scenic driving)
      if (element.tags?.maxspeed) {
        const speedMatch = element.tags.maxspeed.match(/(\d+)/);
        if (speedMatch) {
          const speed = parseInt(speedMatch[1]);
          if (speed >= 45 && speed <= 65) {
            twistiness += 0.3; // Bonus for ideal speed range
          }
        }
      } else if (element.tags?.highway === 'secondary') {
        // Secondary roads without explicit speed limits are likely in our target range (45-55mph)
        twistiness += 0.2; // Moderate bonus for secondary roads without speed info
      }

      // Base score for road type, as a fallback or addition
      if (element.tags?.highway) {
        if (element.tags.highway === 'tertiary') twistiness += 0.5;
        else if (element.tags.highway === 'unclassified') twistiness += 0.2;
        else if (element.tags.highway === 'residential') twistiness += 0.1;
        else if (element.tags.highway === 'secondary') twistiness += 1.2; // Significant increase for secondary roads - they're our prime targets
      }

      // Apply penalty score from suitability check
      if (suitability.penaltyScore > 0) {
        twistiness = Math.max(0, twistiness - suitability.penaltyScore);
        // console.log(`  - PENALIZING ROAD: ${name}, Penalty: ${suitability.penaltyScore.toFixed(2)}, Final Twistiness: ${twistiness.toFixed(4)}, Reasons: ${suitability.reasons.join(', ')}`);
      }

      // Calculate distances
      const distToStart = calculateDistance(
        { lat: element.lat, lon: element.lon },
        startCoords
      );
      const distToEnd = calculateDistance(
        { lat: element.lat, lon: element.lon },
        endCoords
      );

      // Calculate progress score (how much this point helps move towards destination)
      const directRouteDist = calculateDistance(startCoords, endCoords);
      const totalDist = distToStart + distToEnd;
      const progressScore = directRouteDist / totalDist;

      // Adjust twistiness based on progress - more lenient for scenic routes
      // Secondary roads get much less penalty since they're our primary targets
      const isSecondaryRoad = element.tags?.highway === 'secondary';
      const progressMultiplier = isSecondaryRoad ? 
        0.9 + (0.1 * progressScore) : // Minimal penalty for secondary roads
        0.7 + (0.3 * progressScore);  // Standard penalty for others
      const originalTwistiness = twistiness;
      twistiness *= progressMultiplier;

      // Filter out points with very low twistiness score
      if (twistiness < 0.05) { // Reduced from 0.1 to include more roads
        if (process.env.REACT_APP_VERBOSE_LOGGING === 'true' && element.tags?.name && element.tags.name.toLowerCase().includes('lyons')) {
          console.log(`  - FILTERED OUT: ${name} - Twistiness: ${twistiness.toFixed(4)} (orig: ${originalTwistiness.toFixed(4)}), Highway: ${element.tags?.highway}, Progress: ${progressScore.toFixed(4)}, Multiplier: ${progressMultiplier.toFixed(4)}`);
        }
        return null;
      }

      // Penalize points that are too close to start or end
      if (distToStart < 5 || distToEnd < 5) {
        twistiness *= 0.5; // reduce score but don't discard
      }

      // Only include waypoints with valid coordinates and non-zero twistiness
      if (!lat || !lon || twistiness === 0) {
        return null;
      }

      const waypoint: SuggestedWaypoint = {
        id: `twisty-${element.id}`,
        location: name,
        description: getStrategicRoutingDescription(element.tags),
        checked: true,
        type: 'strategic_routing',
        coordinates: { lat, lon },
        roadType: element.tags?.highway || 'unknown',
        twistiness: twistiness,
        tags: element.tags,
        score: 0, // Initialize score
        strategicValue: 0 // Initialize strategic value
      };

      // Debug logging for secondary roads to understand scoring (only in verbose mode)
      if (process.env.REACT_APP_VERBOSE_LOGGING === 'true' && element.tags?.highway === 'secondary') {
        // Calculate distance for this segment for debugging
        let segmentDistance = 0;
        if (element.type === 'way' && element.nodes) {
          const coords = element.nodes.map((id: number) => nodeMap.get(id)).filter(Boolean);
          for (let i = 0; i < coords.length - 1; i++) {
            segmentDistance += calculateDistance(coords[i], coords[i + 1]);
          }
        }
        console.log(`%c[Secondary Road] ${name}: Final Score: ${twistiness.toFixed(3)}, Original: ${originalTwistiness.toFixed(3)}, Progress: ${progressScore.toFixed(3)}, Multiplier: ${progressMultiplier.toFixed(3)}, Lanes: ${element.tags?.lanes || 'none'}, Speed: ${element.tags?.maxspeed || 'none'}, Surface: ${element.tags?.surface || 'none'}, Distance: ${(segmentDistance / 1000).toFixed(2)}km, Filtered: ${twistiness < 0.05 ? 'YES' : 'NO'}`, 'color: #0066CC;');
      }

      return waypoint;
    } catch (error) {
      console.log('  - Error processing element:', error);
      return null;
    }
  }).filter((wp: SuggestedWaypoint | null): wp is SuggestedWaypoint => !!wp);

  console.log(`  - Generated ${waypoints.length} waypoints after processing.`);

  // LINK ROAD SEGMENTS INTO COMPLETE ROADS
  if (process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
    console.log('  - Linking road segments into complete roads...');
  }
  const linkedRoads = linkRoadSegments(waypoints);
  
  if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
    console.log(`%c[Road Linking] Found ${linkedRoads.length} linked roads:`, 'color: #00A36C;');
    linkedRoads.slice(0, 5).forEach(road => {
      console.log(`  - ${road.name}: ${road.segments.length} segments, ${(road.totalLength/1000).toFixed(1)}km, avg twistiness: ${road.averageTwistiness.toFixed(2)}`);
    });
  }

  // CREATE STRATEGIC WAYPOINTS FROM LINKED ROADS
  const strategicWaypoints = createStrategicWaypointsFromLinkedRoads(linkedRoads, 15);
  if (process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
    console.log(`  - Created ${strategicWaypoints.length} strategic waypoints from linked roads.`);
  }

  // MERGE STRATEGIC WAYPOINTS WITH ORIGINAL WAYPOINTS
  const allWaypoints = [...strategicWaypoints, ...waypoints];
  
  // Remove duplicates (strategic waypoints might overlap with original ones)
  const uniqueWaypoints = removeDuplicateWaypoints(allWaypoints);
  
  if (process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
    console.log(`  - Final waypoint count: ${uniqueWaypoints.length} (${strategicWaypoints.length} strategic + ${waypoints.length} original - duplicates)`);
  }
  
  return uniqueWaypoints;
}

/**
 * Remove duplicate waypoints that are too close to each other
 */
function removeDuplicateWaypoints(waypoints: SuggestedWaypoint[]): SuggestedWaypoint[] {
  const DUPLICATE_THRESHOLD = 500; // 500m - waypoints closer than this are considered duplicates
  const uniqueWaypoints: SuggestedWaypoint[] = [];
  
  waypoints.forEach(waypoint => {
    if (!waypoint.coordinates) {
      uniqueWaypoints.push(waypoint);
      return;
    }
    
    // Check if this waypoint is too close to any existing waypoint
    const isDuplicate = uniqueWaypoints.some(existing => {
      if (!existing.coordinates) return false;
      const distance = calculateDistance(waypoint.coordinates!, existing.coordinates);
      return distance < DUPLICATE_THRESHOLD;
    });
    
    if (!isDuplicate) {
      uniqueWaypoints.push(waypoint);
    }
  });
  
  return uniqueWaypoints;
} 