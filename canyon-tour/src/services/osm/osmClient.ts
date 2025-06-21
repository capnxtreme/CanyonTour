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
    console.log('  - Query:', overpassQuery);

    return this.executeQuery(overpassQuery);
  }

  private buildOverpassQuery(bboxString: string): string {
    // More comprehensive and resilient Overpass query.
    // This query looks for desirable paved roads and also specifically includes roads with scenic names.
    return `[out:json][timeout:45];
(
  // Find standard, paved road types within the bounding box
  way["highway"~"^(secondary|tertiary|unclassified|residential)$"]
     ["surface"!~"unpaved|gravel|dirt|sand|ground|mud|earth|compacted"]
     ["name"]
     (${bboxString});
     
  // Also include roads specifically named as scenic, even if their type is less desirable
  way["highway"]["name"~"canyon|valley|ridge|mountain|scenic|vista|view",i]
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

      // Special logging for roads with interesting names
      const interestingRoads = data.elements.filter((e: any) =>
        e.tags?.name && (
          e.tags.name.toLowerCase().includes('lyons') ||
          e.tags.name.toLowerCase().includes('valley') ||
          e.tags.name.toLowerCase().includes('japatul')
        )
      );

      if (interestingRoads.length > 0) {
        console.log('  - Interesting roads found:', interestingRoads.map((e: any) => e.tags.name));
      }
    }

    return data;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const osmClient = new OsmClient(); 