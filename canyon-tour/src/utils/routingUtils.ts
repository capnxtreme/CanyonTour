import { SuggestedWaypoint, Coordinates, RouteOption } from '../types';
const geolib = require('geolib');

const MAX_WAYPOINTS = 10;
const STRATEGIES = ['Twisty', 'Balanced', 'Direct'];

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


/**
 * Scores a route segment based on its twistiness and detour cost.
 * Higher scores are better.
 * @param waypoint - The candidate waypoint.
 * @param currentPosition - The current location in the route.
 * @param end - The final destination.
 * @param baseDistance - The direct distance from current to end.
 * @param strategy - The routing strategy.
 * @returns The score for the waypoint.
 */
function scoreWaypoint(
    waypoint: SuggestedWaypoint,
    currentPosition: Coordinates,
    end: Coordinates,
    baseDistance: number,
    strategy: 'Twisty' | 'Balanced' | 'Direct'
): number {
    if (!waypoint.coordinates) {
        return -Infinity; // Skip waypoints without coordinates
    }
    const distanceToWaypoint = calculateDistance(currentPosition, waypoint.coordinates);
    const distanceFromWaypointToEnd = calculateDistance(waypoint.coordinates, end);
    const detourDistance = distanceToWaypoint + distanceFromWaypointToEnd - baseDistance;

    // Hard constraint: do not pick a waypoint that takes us further from the destination
    if (distanceFromWaypointToEnd > baseDistance) {
        return -Infinity;
    }

    // Softer constraint: heavily penalize detours, but allow them if the twistiness is high enough
    let detourPenalty = detourDistance;
    if (strategy === 'Twisty') {
        // For the 'Twisty' strategy, we are more tolerant of detours if they are scenic.
        // We can reduce the penalty, making scenic routes more attractive.
        // A smaller divisor here means a larger penalty for detours, so we use a larger one for 'Twisty'.
        detourPenalty = detourDistance / 2; // more tolerant of detours
    } else if (strategy === 'Balanced') {
        detourPenalty = detourDistance; // moderately tolerant
    } else { // Direct
        detourPenalty = detourDistance * 2; // heavily penalize detours
    }
    
    // The score is a combination of the waypoint's intrinsic scenic value (twistiness)
    // and the cost of the detour. We want high twistiness and low detour cost.
    const score = (waypoint.twistiness || 0) - detourPenalty;

    return score;
}


/**
 * Selects the best next waypoint from a list of available waypoints based on the chosen strategy.
 * @param availableWaypoints - The list of waypoints to choose from.
 * @param currentPosition - The current location.
 * @param end - The final destination.
 * @param strategy - The routing strategy.
 * @param previousAngle - The angle of the last segment, used to avoid doubling back.
 * @returns The best waypoint to visit next, or null if none are suitable.
 */
function selectNextWaypoint(
    availableWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    strategy: 'Twisty' | 'Balanced' | 'Direct',
    isFirstWaypoint: boolean
): SuggestedWaypoint | null {
    let bestWaypoint: SuggestedWaypoint | null = null;
    let maxScore = -Infinity;

    const baseDistance = calculateDistance(currentPosition, end);
    
    const scoreAndSelect = (waypoint: SuggestedWaypoint) => {
        const score = scoreWaypoint(waypoint, currentPosition, end, baseDistance, strategy);
        if (score > maxScore) {
            maxScore = score;
            bestWaypoint = waypoint;
        }
    };

    // Special check for the first waypoint to prevent starting in the wrong direction.
    if (isFirstWaypoint) {
        const startToEndVector = {
            x: end.lon - currentPosition.lon,
            y: end.lat - currentPosition.lat
        };

        availableWaypoints.forEach(waypoint => {
            if (!waypoint.coordinates) return; // Skip waypoints without coordinates
            const startToWaypointVector = {
                x: waypoint.coordinates.lon - currentPosition.lon,
                y: waypoint.coordinates.lat - currentPosition.lat
            };
            
            // Using dot product to check if the waypoint is roughly in the same direction as the destination
            const dotProduct = startToEndVector.x * startToWaypointVector.x + startToEndVector.y * startToWaypointVector.y;
            
            if (dotProduct > 0) { // Waypoint is generally towards the destination
                scoreAndSelect(waypoint);
            }
        });
    } else {
         availableWaypoints.forEach(scoreAndSelect);
    }

    return bestWaypoint;
}


/**
 * Generates a single route based on a specific strategy.
 * @param allWaypoints - All available suggested waypoints.
 * @param start - The starting coordinates.
 * @param end - The final destination.
 * @param strategy - The routing strategy to use.
 * @returns A generated route option.
 */
function generateRoute(
    allWaypoints: SuggestedWaypoint[],
    start: Coordinates,

    end: Coordinates,
    strategy: 'Twisty' | 'Balanced' | 'Direct'
): RouteOption {
    let currentPosition = start;
    const route: SuggestedWaypoint[] = [];
    let availableWaypoints = [...allWaypoints];
    let isFirstWaypoint = true;

    while (route.length < MAX_WAYPOINTS) {
        const nextWaypoint = selectNextWaypoint(
            availableWaypoints,
            currentPosition,
            end,
            strategy,
            isFirstWaypoint
        );

        if (!nextWaypoint) {
            break; // No more suitable waypoints found
        }
        
        route.push(nextWaypoint);
        currentPosition = nextWaypoint.coordinates!; // We know it exists because selectNextWaypoint checks
        availableWaypoints = availableWaypoints.filter(w => w.id !== nextWaypoint.id);
        isFirstWaypoint = false;
    }

    const totalDistance = calculateTotalDistance([start, ...route.map(r => r.coordinates!), end]);
    const totalTwistiness = route.reduce((sum, wp) => sum + (wp.twistiness || 0), 0);

    return {
        name: `${strategy} Route`,
        waypoints: route,
        start,
        end,
        totalDistance,
        totalTwistiness
    };
}

/**
 * Generates multiple route options based on different strategies.
 * @param allWaypoints - All available suggested waypoints.
 * @param start - The starting coordinates.
 * @param end - The final destination.
 * @returns An array of generated route options.
 */
export function generateRouteOptions(
    allWaypoints: SuggestedWaypoint[],
    start: Coordinates,
    end: Coordinates
): RouteOption[] {
    const options: RouteOption[] = [];

    for (const strategy of STRATEGIES) {
        const route = generateRoute(allWaypoints, start, end, strategy as 'Twisty' | 'Balanced' | 'Direct');
        if (route.waypoints.length > 0) {
            options.push(route);
        }
    }

    // If no routes were generated (e.g., all waypoints were unsuitable),
    // create a direct route as a fallback.
    if (options.length === 0) {
        const directDistance = calculateTotalDistance([start, end]);
        options.push({
            name: 'Direct Route',
            waypoints: [],
            start,
            end,
            totalDistance: directDistance,
            totalTwistiness: 0,
        });
    }

    return options;
}

/**
 * Calculates the total distance of a route.
 * @param locations - An array of coordinates representing the route.
 * @returns The total distance in meters.
 */
function calculateTotalDistance(locations: Coordinates[]): number {
    let totalDistance = 0;
    for (let i = 0; i < locations.length - 1; i++) {
        totalDistance += calculateDistance(locations[i], locations[i+1]);
    }
    return totalDistance;
}

