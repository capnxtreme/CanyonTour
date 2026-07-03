import { Coordinates } from '../../types';
import { osmClient } from './osmClient';

export interface OsmRoadData {
  elements: any[];
}

/**
 * Fetches raw OSM road data (ways + node geometry) for the corridor between
 * two coordinates. The routing layer turns this into a topology road graph.
 */
export const fetchOsmRoadData = async (
  startCoords: Coordinates,
  endCoords: Coordinates
): Promise<OsmRoadData | null> => {
  try {
    const osmData = await osmClient.fetchRoadData(startCoords, endCoords);
    if (!osmData || !osmData.elements || osmData.elements.length === 0) {
      console.log('  - No OSM data found');
      return null;
    }
    return osmData;
  } catch (error) {
    console.error('Error fetching OSM road data:', error);
    return null;
  }
};
