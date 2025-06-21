import { SuggestedWaypoint, Coordinates } from '../../types';
import { osmClient } from './osmClient';
import { processOsmData } from './waypointProcessor';

export const findTwistyRoadWaypoints = async (
  startCoords: Coordinates,
  endCoords: Coordinates
): Promise<SuggestedWaypoint[]> => {
  try {
    console.log('--- Finding Twisty Road Waypoints (Advanced) ---');
    
    // Fetch OSM data using the client
    const osmData = await osmClient.fetchRoadData(startCoords, endCoords);
    
    if (!osmData || !osmData.elements || osmData.elements.length === 0) {
      console.log('  - No OSM data found');
      return [];
    }
    
    // Process the OSM data into waypoints
    const waypoints = processOsmData(osmData, startCoords, endCoords);
    
    console.log(`  - ✅ Generated ${waypoints.length} waypoints from OSM data`);
    return waypoints;
    
  } catch (error) {
    console.error('Error finding twisty road waypoints:', error);
    return [];
  }
}; 