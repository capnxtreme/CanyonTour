import { Coordinates } from '../../types';
import { getEnhancedRouteBoundingBoxFromCoords } from '../googleMapsService';

interface OsmData {
  elements: any[];
}

class OsmClient {
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // 2 seconds

  async fetchRoadData(startCoords: Coordinates, endCoords: Coordinates): Promise<OsmData | null> {
    // Use the enhanced bounding box for a more reliable search area
    const bboxString = await getEnhancedRouteBoundingBoxFromCoords(startCoords, endCoords);
    if (!bboxString) {
      console.log('  - ❌ Could not calculate a valid bounding box. Aborting.');
      return null;
    }

    const overpassQuery = this.buildOverpassQuery(bboxString);
    console.log('  - Executing Overpass query...');

    return this.executeQuery(overpassQuery);
  }

  private buildOverpassQuery(bboxString: string): string {
    // Fetch all paved drivable road classes in the bounding box, selected by
    // OSM metadata only (no street-name filters). Unnamed rural roads are
    // often the best scenic roads, so no ["name"] requirement.
    return `[out:json][timeout:45];
(
  way["highway"~"^(primary|secondary|tertiary|unclassified|residential)$"]
     ["surface"!~"unpaved|gravel|dirt|sand|ground|mud|earth|compacted"]
     (${bboxString});
);
(._;>;);
out;`;
  }

  private async executeQuery(query: string): Promise<OsmData | null> {
    let retryCount = 0;
    let response;

    while (retryCount < this.maxRetries) {
      try {
        response = await fetch(`https://overpass-api.de/api/interpreter`, {
          method: 'POST',
          body: query,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        if (response.status === 429) {
          console.log(`  - Rate limited by Overpass API. Retry ${retryCount + 1}/${this.maxRetries}...`);
          await this.delay(this.retryDelay);
          retryCount++;
          continue;
        }

        break;
      } catch (error) {
        console.log(`  - Error fetching from Overpass API. Retry ${retryCount + 1}/${this.maxRetries}...`);
        await this.delay(this.retryDelay);
        retryCount++;
      }
    }

    if (!response || !response.ok) {
      console.log('  - Failed to get response from Overpass API after retries');
      return null;
    }

    const data = await response.json();
    console.log(`  - ✅ Overpass query successful. Found ${data.elements?.length || 0} potential elements.`);

    return data;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const osmClient = new OsmClient(); 