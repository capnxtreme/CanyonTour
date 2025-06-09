import { SuggestedWaypoint } from '../types';
import { geocodeLocation, getEnhancedRouteBoundingBox } from './googleMapsService';
import { calculateDistance, getStrategicRoutingDescription } from '../utils/routingUtils';

export const findTwistyRoadWaypoints = async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    console.log('3. Finding twisty road waypoints...');
    console.log('  - Start location:', start);
    console.log('  - End location:', end);
    try {
      // Get coordinates for start and end points
      const startCoords = await geocodeLocation(start);
      const endCoords = await geocodeLocation(end);
      
      // Log geocoding results
      console.log('  - Geocoding results:', {
        start: {
          input: start,
          coordinates: startCoords
        },
        end: {
          input: end,
          coordinates: endCoords
        }
      });

      if (!startCoords || !endCoords) {
        console.log('  - ❌ Failed to get coordinates for start or end points');
        return [];
      }

      const bbox = await getEnhancedRouteBoundingBox(start, end);
      if (!bbox) {
        console.log('  - ❌ Failed to get bounding box. Check if start/end locations are valid.');
        return [];
      }
      console.log('  - Using bounding box:', bbox);

      // Split bbox into components for proper formatting
      const [minLat, minLon, maxLat, maxLon] = bbox.split(',').map(Number);
      
      // Log the coordinates for debugging
      console.log('  - Bounding box coordinates:', {
        minLat,
        minLon,
        maxLat,
        maxLon,
        width: maxLon - minLon,
        height: maxLat - minLat
      });

      // Validate coordinates
      if (isNaN(minLat) || isNaN(minLon) || isNaN(maxLat) || isNaN(maxLon)) {
        console.log('  - ❌ Invalid coordinates in bounding box');
        return [];
      }

      // Check if bounding box is too small
      const width = maxLon - minLon;
      const height = maxLat - minLat;
      if (width < 0.01 || height < 0.01) {
        console.log('  - ⚠️ Bounding box is very small:', { width, height });
      }
      
      const overpassQuery = `
[out:json][timeout:25];
(
  // Focus on roads that are likely to be twisty and paved
  way["highway"~"^(tertiary|unclassified|residential|secondary)$"]
     ["surface"!~"^(unpaved|dirt|gravel|ground)$"]
     (${minLat},${minLon},${maxLat},${maxLon});
);
out body;
>;
out skel qt;`;

      console.log('  - Executing Overpass query...');
      console.log('  - Query:', overpassQuery);
      
      // Add rate limiting protection
      const maxRetries = 3;
      const retryDelay = 2000; // 2 seconds
      
      let retryCount = 0;
      let response;
      
      while (retryCount < maxRetries) {
        try {
          response = await fetch(`https://overpass-api.de/api/interpreter`, {
            method: 'POST',
            body: overpassQuery,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });
          
          if (response.status === 429) {
            console.log(`  - Rate limited by Overpass API. Retry ${retryCount + 1}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryCount++;
            continue;
          }
          
          break;
        } catch (error) {
          console.log(`  - Error fetching from Overpass API. Retry ${retryCount + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retryCount++;
        }
      }
      
      if (!response || !response.ok) {
        console.log('  - Failed to get response from Overpass API after retries');
        return [];
      }

      console.log('  - Overpass API response status:', response.status);
      console.log('  - Overpass API response headers:', Object.fromEntries(response.headers.entries()));

      const data = await response.json();
      console.log(`  - ✅ Overpass query successful. Found ${data.elements?.length || 0} potential elements.`);
      
      // Log the first few elements for debugging
      if (data.elements?.length > 0) {
        console.log('  - Sample elements:', data.elements.slice(0, 3).map((e: any) => ({
          type: e.type,
          id: e.id,
          tags: e.tags,
          hasNodes: e.nodes?.length > 0,
          hasBounds: !!e.bounds,
          hasLatLon: !!(e.lat && e.lon)
        })));
      }

      // First, build a map of node coordinates for ways
      const nodeMap = new Map();
      data.elements?.forEach((element: any) => {
        if (element.type === 'node') {
          nodeMap.set(element.id, { lat: element.lat, lon: element.lon });
        }
      });

      console.log(`  - Built node map with ${nodeMap.size} nodes`);

      const calculateAngle = (p1: any, p2: any, p3: any) => {
        const angle1 = Math.atan2(p2.lat - p1.lat, p2.lon - p1.lon);
        const angle2 = Math.atan2(p3.lat - p2.lat, p3.lon - p2.lon);
        let angle = (angle2 - angle1) * (180 / Math.PI);
        if (angle > 180) angle -= 360;
        if (angle < -180) angle += 360;
        return angle;
      };

      const calculateWayTwistiness = (nodeIds: number[]) => {
        const coords = nodeIds.map(id => nodeMap.get(id)).filter(Boolean);
        if (coords.length < 3) return 0;

        let totalAngle = 0;
        let totalDistance = 0;

        for (let i = 1; i < coords.length - 1; i++) {
          totalAngle += Math.abs(calculateAngle(coords[i-1], coords[i], coords[i+1]));
        }

        for (let i = 0; i < coords.length - 1; i++) {
          totalDistance += calculateDistance(coords[i], coords[i+1]);
        }

        if (totalDistance === 0) return 0;
        return (totalAngle / totalDistance) * 10; // Scale factor for significance
      };

      // Filter and process elements
      const validElements = data.elements?.filter((element: any) => {
        if (!element || !element.tags) {
          return false;
        }
        
        // For ways, calculate center from nodes
        if (element.type === 'way' && element.nodes) {
          const nodeCoords = element.nodes
            .map((nodeId: number) => nodeMap.get(nodeId))
            .filter(Boolean);
          
          if (nodeCoords.length > 0) {
            const center = nodeCoords.reduce(
              (acc: any, coord: any) => ({
                lat: acc.lat + coord.lat / nodeCoords.length,
                lon: acc.lon + coord.lon / nodeCoords.length
              }),
              { lat: 0, lon: 0 }
            );
            element.lat = center.lat;
            element.lon = center.lon;
          } else {
            return false;
          }
        }
        
        // For nodes, use their coordinates directly
        if (element.type === 'node') {
          if (!element.lat || !element.lon) {
            return false;
          }
        }
        
        // Ensure the element is within the bounding box
        if (element.lat < minLat || element.lat > maxLat || 
            element.lon < minLon || element.lon > maxLon) {
          return false;
        }
        
        return true;
      }) || [];
      
      console.log(`  - Found ${validElements.length} elements with valid tags and coordinates`);

      // Log sample of valid elements
      if (validElements.length > 0) {
        console.log('  - Sample valid elements:', validElements.slice(0, 3).map((e: any) => ({
          type: e.type,
          id: e.id,
          tags: e.tags,
          lat: e.lat,
          lon: e.lon
        })));
      }

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
          
          const lat = element.lat;
          const lon = element.lon;
          
          // Calculate twistiness based on road characteristics
          let twistiness = 0;

          if (element.type === 'way' && element.nodes) {
            twistiness = calculateWayTwistiness(element.nodes);
          }
          
          // Base score for road type, as a fallback or addition
          if (element.tags?.highway) {
            if (element.tags.highway === 'tertiary') twistiness += 0.5;
            else if (element.tags.highway === 'unclassified') twistiness += 0.2;
            else if (element.tags.highway === 'residential') twistiness += 0.1;
            else if (element.tags.highway === 'secondary') twistiness += 0.4;
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
          
          // Adjust twistiness based on progress
          twistiness *= progressScore;
          
          // Filter out points with very low twistiness score
          if (twistiness < 0.1) {
            // console.log(`  - Filtered out waypoint ${name}: Twistiness score ${twistiness} too low`);
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
          
          return {
            id: `twisty-${element.id}`,
            location: name,
            description: getStrategicRoutingDescription(element.tags),
            checked: true,
            type: 'strategic_routing',
            coordinates: { lat, lon },
            roadType: element.tags?.highway || 'unknown',
            twistiness: twistiness
          };
        } catch (error) {
          console.log('  - Error processing element:', error);
          return null;
        }
      }).filter(Boolean);

      console.log(`  - After filtering, ${waypoints.length} waypoints remaining`);

      // Sort waypoints by twistiness score
      waypoints.sort((a: SuggestedWaypoint, b: SuggestedWaypoint) => (b.twistiness || 0) - (a.twistiness || 0));
      
      console.log(`  - Found ${waypoints.length} total twisty waypoints.`);
      return waypoints;
    } catch (error) {
      console.log('  - ❌ Advanced OSM query fetch failed:', error);
    }
    return [];
  };
