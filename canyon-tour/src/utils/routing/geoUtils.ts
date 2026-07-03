import { Coordinates } from '../../types';
import * as geolib from 'geolib';

/**
* Calculates the great-circle distance between two coordinates.
* @param coord1 - The first coordinate.
* @param coord2 - The second coordinate.
* @returns The distance in meters.
*/
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    return geolib.getDistance(coord1, coord2);
}

/**
 * Generates a strategic routing description based on OSM tags.
 * @param tags - The OSM tags object.
 * @returns A descriptive string for the waypoint.
 */
export function getStrategicRoutingDescription(tags: any): string {
    if (!tags) return 'Scenic waypoint';
    
    const highway = tags.highway;
    const name = tags.name;
    const ref = tags.ref;
    
    let description = '';
    
    if (highway) {
        switch (highway) {
            case 'tertiary':
                description = 'Scenic tertiary road';
                break;
            case 'secondary':
                description = 'Winding secondary road';
                break;
            case 'unclassified':
                description = 'Quiet country road';
                break;
            case 'residential':
                description = 'Local residential route';
                break;
            default:
                description = `${highway} road`;
        }
    } else {
        description = 'Scenic route';
    }
    
    if (name) {
        description += ` (${name})`;
    } else if (ref) {
        description += ` ${ref}`;
    }
    
    return description;
} 