import { SuggestedWaypoint, Coordinates, RouteOption } from '../../types';
import { calculateDistance } from './geoUtils';

export const STRATEGIES = [
    'Twisty', 
    'Balanced', 
    'Direct', 
    'Scenic Loop', 
    'Mountain Route', 
    'Valley Route',
    'Adventure Route',
    'Historic Route'
];

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
export function scoreWaypoint(
    waypoint: SuggestedWaypoint,
    currentPosition: Coordinates,
    end: Coordinates,
    baseDistance: number,
    strategy: string
): number {
    if (!waypoint.coordinates) {
        return -Infinity; // Skip waypoints without coordinates
    }
    const distanceToWaypoint = calculateDistance(currentPosition, waypoint.coordinates);
    const distanceFromWaypointToEnd = calculateDistance(waypoint.coordinates, end);
    const detourDistance = distanceToWaypoint + distanceFromWaypointToEnd - baseDistance;

    // Base scoring factors
    const twistiness = waypoint.twistiness || 0;
    const elevation = waypoint.elevation || 0;
    const score = waypoint.score || 0;
    const strategicValue = waypoint.strategicValue || 0;

    // Strategy-specific scoring
    let finalScore = 0;
    let detourTolerance = 1;

    switch (strategy) {
        case 'Twisty':
            finalScore = twistiness * 2 + strategicValue;
            detourTolerance = 0.5; // More tolerant of detours
            
            // Special handling for valley roads - be more permissive
            const isValleyRoad = waypoint.description?.toLowerCase().includes('valley') || 
                               waypoint.location?.toLowerCase().includes('valley');
            
            if (isValleyRoad) {
                // For valley roads like Lyons Valley Road, allow larger detours to include more sections
                if (distanceFromWaypointToEnd > baseDistance * 1.5) {
                    console.log(`Twisty: Filtering out valley road ${waypoint.description || waypoint.location} - too far from destination (${distanceFromWaypointToEnd.toFixed(0)}m vs ${(baseDistance * 1.5).toFixed(0)}m limit)`);
                    return -Infinity;
                }
                // Bonus for valley roads in twisty routes
                finalScore += 1.0;
            }
            break;

        case 'Balanced':
            finalScore = twistiness + strategicValue + (elevation / 1000);
            detourTolerance = 1;
            break;

        case 'Direct':
            finalScore = strategicValue + (twistiness * 0.5);
            detourTolerance = 2; // Less tolerant of detours
            break;

        case 'Scenic Loop':
            // Favor waypoints that create interesting loops and circles back
            finalScore = twistiness + score + strategicValue;
            detourTolerance = 0.3; // Very tolerant of detours for loops
            // Allow more significant detours for scenic loops
            break;

        case 'Mountain Route':
            // Prioritize elevation and mountain features
            const elevationBonus = elevation > 1000 ? (elevation / 500) : 0;
            const mountainBonus = (waypoint.type === 'peak' || waypoint.type === 'mountain' || 
                                 waypoint.type === 'viewpoint') ? 5 : 0;
            finalScore = elevationBonus + mountainBonus + twistiness + strategicValue;
            detourTolerance = 0.7;
            break;

        case 'Valley Route':
            // Prefer valley routes and lower elevation scenic points
            const valleyBonus = elevation < 500 ? 3 : 0;
            const riverBonus = (waypoint.type === 'waterfall' || waypoint.type === 'river' || 
                              waypoint.description?.toLowerCase().includes('creek')) ? 4 : 0;
            finalScore = valleyBonus + riverBonus + twistiness + strategicValue;
            detourTolerance = 0.8;
            break;

        case 'Adventure Route':
            // Favor adventure and outdoor activity waypoints
            const adventureBonus = (waypoint.type === 'cave' || waypoint.type === 'hot_spring' ||
                                  waypoint.type === 'recreation' || waypoint.type === 'park') ? 6 : 0;
            finalScore = adventureBonus + twistiness + strategicValue + score;
            detourTolerance = 0.6;
            break;

        case 'Historic Route':
            // Prioritize historic and cultural waypoints
            const historicBonus = (waypoint.type === 'monument' || waypoint.type === 'castle' ||
                                 waypoint.type === 'historic' || waypoint.type === 'museum') ? 7 : 0;
            finalScore = historicBonus + strategicValue + score;
            detourTolerance = 1.0;
            break;

        default:
            finalScore = twistiness + strategicValue;
            detourTolerance = 1;
            if (distanceFromWaypointToEnd > baseDistance) {
                return -Infinity;
            }
    }

    // Apply detour penalty with strategy-specific tolerance
    const detourPenalty = detourDistance * detourTolerance;
    return finalScore - detourPenalty;
}

/**
 * Filters waypoints based on strategy-specific criteria
 */
export function filterWaypointsForStrategy(waypoints: SuggestedWaypoint[], strategy: string): SuggestedWaypoint[] {
    // First, sort waypoints by different criteria for each strategy
    let filteredWaypoints = [...waypoints];
    
    switch (strategy) {
        case 'Mountain Route':
            // Prioritize high elevation and mountain features
            filteredWaypoints = waypoints.filter(wp => 
                (wp.elevation && wp.elevation > 300) || 
                wp.type === 'peak' || wp.type === 'mountain' || wp.type === 'viewpoint' ||
                wp.description?.toLowerCase().includes('summit') ||
                wp.description?.toLowerCase().includes('overlook')
            );
            // If too restrictive, fallback to top elevation waypoints
            if (filteredWaypoints.length < 3 && waypoints.length > 3) {
                filteredWaypoints = waypoints
                    .sort((a, b) => (b.elevation || 0) - (a.elevation || 0))
                    .slice(0, Math.max(waypoints.length / 2, 5));
            }
            break;
        
        case 'Valley Route':
            // Prefer low elevation and water features, especially roads with "valley" in name
            filteredWaypoints = waypoints.filter(wp => 
                (!wp.elevation || wp.elevation < 1000) ||
                wp.type === 'waterfall' || wp.type === 'river' ||
                wp.description?.toLowerCase().includes('valley') ||
                wp.location?.toLowerCase().includes('valley') ||
                wp.description?.toLowerCase().includes('creek') ||
                wp.description?.toLowerCase().includes('stream')
            );
            
            console.log(`Valley Route filtering: ${filteredWaypoints.length} waypoints after filtering from ${waypoints.length}`);
            const lyonsWaypoints = filteredWaypoints.filter(wp => 
                wp.description?.toLowerCase().includes('lyons') || wp.location?.toLowerCase().includes('lyons')
            );
            console.log(`  - Found ${lyonsWaypoints.length} Lyons waypoints:`, lyonsWaypoints.map(wp => wp.description || wp.location));
            
            if (filteredWaypoints.length < 3 && waypoints.length > 3) {
                filteredWaypoints = waypoints
                    .sort((a, b) => (a.elevation || 0) - (b.elevation || 0))
                    .slice(0, Math.max(waypoints.length / 2, 5));
                console.log(`Valley Route fallback: expanded to ${filteredWaypoints.length} waypoints`);
            }
            break;
            
        case 'Adventure Route':
            filteredWaypoints = waypoints.filter(wp => 
                wp.type === 'cave' || wp.type === 'hot_spring' || wp.type === 'recreation' || 
                wp.type === 'park' || wp.type === 'trail'
            );
            if (filteredWaypoints.length < 3 && waypoints.length > 3) {
                filteredWaypoints = waypoints
                    .sort((a, b) => (b.score || 0) - (a.score || 0)) // Assuming score reflects adventure
                    .slice(0, Math.max(waypoints.length / 2, 5));
            }
            break;
            
        case 'Historic Route':
            filteredWaypoints = waypoints.filter(wp => 
                wp.type === 'monument' || wp.type === 'castle' || wp.type === 'historic' || 
                wp.type === 'museum'
            );
            if (filteredWaypoints.length < 3 && waypoints.length > 3) {
                filteredWaypoints = waypoints
                    .sort((a, b) => (b.strategicValue || 0) - (a.strategicValue || 0)) // Assuming strategic value relates to historic
                    .slice(0, Math.max(waypoints.length / 2, 5));
            }
            break;
    }
    
    return filteredWaypoints;
}

export function analyzeWaypoints(waypoints: SuggestedWaypoint[]) {
    const analysis = {
        hasMountains: waypoints.some(wp => (wp.elevation && wp.elevation > 800) || wp.type === 'peak' || wp.type === 'mountain'),
        hasValleys: waypoints.some(wp => (wp.elevation && wp.elevation < 300) || wp.type === 'river' || wp.description?.toLowerCase().includes('valley')),
        hasTwistyRoads: waypoints.some(wp => wp.twistiness && wp.twistiness > 5),
        hasHistoricSites: waypoints.some(wp => wp.type === 'historic' || wp.type === 'monument'),
        hasAdventureSpots: waypoints.some(wp => wp.type === 'cave' || wp.type === 'park' || wp.type === 'recreation')
    };

    if (process.env.NODE_ENV === 'development') {
        console.log("Waypoint Analysis:", analysis);
    }

    return analysis;
}

export function determineViableStrategies(analysis: any): string[] {
    const viableStrategies = ['Twisty', 'Balanced', 'Direct']; // Core strategies are always viable

    if (analysis.hasMountains) {
        viableStrategies.push('Mountain Route');
    }
    if (analysis.hasValleys) {
        viableStrategies.push('Valley Route');
    }
    if (analysis.hasHistoricSites) {
        viableStrategies.push('Historic Route');
    }
    if (analysis.hasAdventureSpots) {
        viableStrategies.push('Adventure Route');
    }
    if (analysis.hasTwistyRoads) {
        viableStrategies.push('Scenic Loop'); // Good for making interesting loops
    }
    
    // Ensure no duplicates
    return [...new Set(viableStrategies)];
} 