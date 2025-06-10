import { SuggestedWaypoint, Coordinates, RouteOption } from '../types';
const geolib = require('geolib');

const MAX_WAYPOINTS = 10;
const STRATEGIES = [
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
            // Hard constraint: heavily penalize going away from destination
            if (distanceFromWaypointToEnd > baseDistance * 1.2) {
                return -Infinity;
            }
            break;

        case 'Balanced':
            finalScore = twistiness + strategicValue + (elevation / 1000);
            detourTolerance = 1;
            if (distanceFromWaypointToEnd > baseDistance * 1.1) {
                return -Infinity;
            }
            break;

        case 'Direct':
            finalScore = strategicValue + (twistiness * 0.5);
            detourTolerance = 2; // Less tolerant of detours
            if (distanceFromWaypointToEnd > baseDistance) {
                return -Infinity;
            }
            break;

        case 'Scenic Loop':
            // Favor waypoints that create interesting loops and circles back
            finalScore = twistiness + score + strategicValue;
            detourTolerance = 0.3; // Very tolerant of detours for loops
            // Allow more significant detours for scenic loops
            if (distanceFromWaypointToEnd > baseDistance * 1.5) {
                return -Infinity;
            }
            break;

        case 'Mountain Route':
            // Prioritize elevation and mountain features
            const elevationBonus = elevation > 1000 ? (elevation / 500) : 0;
            const mountainBonus = (waypoint.type === 'peak' || waypoint.type === 'mountain' || 
                                 waypoint.type === 'viewpoint') ? 5 : 0;
            finalScore = elevationBonus + mountainBonus + twistiness + strategicValue;
            detourTolerance = 0.7;
            if (distanceFromWaypointToEnd > baseDistance * 1.3) {
                return -Infinity;
            }
            break;

        case 'Valley Route':
            // Prefer valley routes and lower elevation scenic points
            const valleyBonus = elevation < 500 ? 3 : 0;
            const riverBonus = (waypoint.type === 'waterfall' || waypoint.type === 'river' || 
                              waypoint.description?.toLowerCase().includes('creek')) ? 4 : 0;
            finalScore = valleyBonus + riverBonus + twistiness + strategicValue;
            detourTolerance = 0.8;
            if (distanceFromWaypointToEnd > baseDistance * 1.2) {
                return -Infinity;
            }
            break;

        case 'Adventure Route':
            // Favor adventure and outdoor activity waypoints
            const adventureBonus = (waypoint.type === 'cave' || waypoint.type === 'hot_spring' ||
                                  waypoint.type === 'recreation' || waypoint.type === 'park') ? 6 : 0;
            finalScore = adventureBonus + twistiness + strategicValue + score;
            detourTolerance = 0.6;
            if (distanceFromWaypointToEnd > baseDistance * 1.4) {
                return -Infinity;
            }
            break;

        case 'Historic Route':
            // Prioritize historic and cultural waypoints
            const historicBonus = (waypoint.type === 'monument' || waypoint.type === 'castle' ||
                                 waypoint.type === 'historic' || waypoint.type === 'museum') ? 7 : 0;
            finalScore = historicBonus + strategicValue + score;
            detourTolerance = 1.0;
            if (distanceFromWaypointToEnd > baseDistance * 1.1) {
                return -Infinity;
            }
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
function filterWaypointsForStrategy(waypoints: SuggestedWaypoint[], strategy: string): SuggestedWaypoint[] {
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
            // Prefer low elevation and water features
            filteredWaypoints = waypoints.filter(wp => 
                (!wp.elevation || wp.elevation < 1000) ||
                wp.type === 'waterfall' || wp.type === 'river' ||
                wp.description?.toLowerCase().includes('valley') ||
                wp.description?.toLowerCase().includes('creek') ||
                wp.description?.toLowerCase().includes('stream')
            );
            if (filteredWaypoints.length < 3 && waypoints.length > 3) {
                filteredWaypoints = waypoints
                    .sort((a, b) => (a.elevation || 0) - (b.elevation || 0))
                    .slice(0, Math.max(waypoints.length / 2, 5));
            }
            break;
            
        case 'Adventure Route':
            filteredWaypoints = waypoints.filter(wp => 
                wp.type === 'cave' || wp.type === 'hot_spring' ||
                wp.type === 'recreation' || wp.type === 'park' ||
                wp.description?.toLowerCase().includes('adventure') ||
                wp.description?.toLowerCase().includes('outdoor') ||
                wp.description?.toLowerCase().includes('trail') ||
                wp.description?.toLowerCase().includes('camping')
            );
            break;
            
        case 'Historic Route':
            filteredWaypoints = waypoints.filter(wp => 
                wp.type === 'monument' || wp.type === 'castle' ||
                wp.type === 'historic' || wp.type === 'museum' ||
                wp.description?.toLowerCase().includes('historic') ||
                wp.description?.toLowerCase().includes('heritage') ||
                wp.description?.toLowerCase().includes('old') ||
                wp.description?.toLowerCase().includes('ancient')
            );
            break;
            
        case 'Scenic Loop':
            // For scenic loops, prefer high-scoring, twisty waypoints
            filteredWaypoints = waypoints
                .filter(wp => (wp.twistiness || 0) > 1)
                .sort((a, b) => (b.twistiness || 0) - (a.twistiness || 0));
            break;
            
        case 'Twisty':
            // Focus on the most twisty routes
            filteredWaypoints = waypoints
                .filter(wp => (wp.twistiness || 0) > 0)
                .sort((a, b) => (b.twistiness || 0) - (a.twistiness || 0));
            break;
            
        case 'Balanced':
            // For balanced, mix high-scoring waypoints with variety
            filteredWaypoints = waypoints
                .sort((a, b) => {
                    const aScore = (a.score || 0) + (a.twistiness || 0) + (a.strategicValue || 0);
                    const bScore = (b.score || 0) + (b.twistiness || 0) + (b.strategicValue || 0);
                    return bScore - aScore;
                });
            break;
            
        case 'Direct':
            // For direct routes, prefer waypoints with high strategic value but low detour
            filteredWaypoints = waypoints
                .sort((a, b) => (b.strategicValue || 0) - (a.strategicValue || 0));
            break;
            
        default:
            return waypoints;
    }
    
    // Ensure we have some waypoints to work with
    return filteredWaypoints.length > 0 ? filteredWaypoints : waypoints;
}

/**
 * Uses different selection algorithms based on strategy
 */
function selectNextWaypoint(
    availableWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    strategy: string,
    isFirstWaypoint: boolean,
    routeSoFar: SuggestedWaypoint[] = []
): SuggestedWaypoint | null {
    
    // Filter waypoints based on strategy
    let candidateWaypoints = filterWaypointsForStrategy(availableWaypoints, strategy);
    
    if (candidateWaypoints.length === 0) {
        candidateWaypoints = availableWaypoints; // Fallback to all waypoints
    }

    const baseDistance = calculateDistance(currentPosition, end);
    
    // Strategy-specific selection algorithms
    switch (strategy) {
        case 'Scenic Loop':
            return selectForScenicLoop(candidateWaypoints, currentPosition, end, baseDistance, routeSoFar);
            
        case 'Adventure Route':
        case 'Historic Route':
        case 'Mountain Route':
        case 'Valley Route':
            return selectBestDiverseWaypoint(candidateWaypoints, currentPosition, end, baseDistance, strategy, routeSoFar);
            
        case 'Twisty':
            return selectWithVariation(candidateWaypoints, currentPosition, end, baseDistance, strategy, isFirstWaypoint, 0.2);
            
        case 'Balanced':
            return selectWithVariation(candidateWaypoints, currentPosition, end, baseDistance, strategy, isFirstWaypoint, 0.3);
            
        default:
            return selectBestWaypoint(candidateWaypoints, currentPosition, end, baseDistance, strategy, isFirstWaypoint);
    }
}

/**
 * Standard best waypoint selection
 */
function selectBestWaypoint(
    candidateWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    baseDistance: number,
    strategy: string,
    isFirstWaypoint: boolean
): SuggestedWaypoint | null {
    let bestWaypoint: SuggestedWaypoint | null = null;
    let maxScore = -Infinity;

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

        candidateWaypoints.forEach(waypoint => {
            if (!waypoint.coordinates) return;
            const startToWaypointVector = {
                x: waypoint.coordinates.lon - currentPosition.lon,
                y: waypoint.coordinates.lat - currentPosition.lat
            };
            
            const dotProduct = startToEndVector.x * startToWaypointVector.x + startToEndVector.y * startToWaypointVector.y;
            
            if (dotProduct > 0) {
                scoreAndSelect(waypoint);
            }
        });
    } else {
        candidateWaypoints.forEach(scoreAndSelect);
    }

    return bestWaypoint;
}

/**
 * Selects waypoints to create scenic loops
 */
function selectForScenicLoop(
    candidateWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    baseDistance: number,
    routeSoFar: SuggestedWaypoint[]
): SuggestedWaypoint | null {
    // For scenic loops, we want to occasionally pick waypoints that create interesting detours
    const scoredWaypoints = candidateWaypoints
        .filter(wp => wp.coordinates)
        .map(wp => ({
            waypoint: wp,
            score: scoreWaypoint(wp, currentPosition, end, baseDistance, 'Scenic Loop')
        }))
        .filter(item => item.score > -Infinity)
        .sort((a, b) => b.score - a.score);

    if (scoredWaypoints.length === 0) return null;

    // Sometimes pick a suboptimal waypoint for variety in loops
    if (routeSoFar.length > 0 && Math.random() < 0.3 && scoredWaypoints.length > 1) {
        return scoredWaypoints[1].waypoint;
    }

    return scoredWaypoints[0].waypoint;
}

/**
 * Selects waypoints with controlled variation to avoid identical routes
 */
function selectWithVariation(
    candidateWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    baseDistance: number,
    strategy: string,
    isFirstWaypoint: boolean,
    variationChance: number
): SuggestedWaypoint | null {
    const scoredWaypoints = candidateWaypoints
        .filter(wp => wp.coordinates)
        .map(wp => ({
            waypoint: wp,
            score: scoreWaypoint(wp, currentPosition, end, baseDistance, strategy)
        }))
        .filter(item => item.score > -Infinity)
        .sort((a, b) => b.score - a.score);

    if (scoredWaypoints.length === 0) return null;

    // Apply first waypoint direction filtering
    if (isFirstWaypoint) {
        const startToEndVector = {
            x: end.lon - currentPosition.lon,
            y: end.lat - currentPosition.lat
        };

        const validWaypoints = scoredWaypoints.filter(item => {
            const wp = item.waypoint;
            if (!wp.coordinates) return false;
            
            const startToWaypointVector = {
                x: wp.coordinates.lon - currentPosition.lon,
                y: wp.coordinates.lat - currentPosition.lat
            };
            
            const dotProduct = startToEndVector.x * startToWaypointVector.x + startToEndVector.y * startToWaypointVector.y;
            return dotProduct > 0;
        });

        if (validWaypoints.length === 0) return null;
        
        // Sometimes pick the second or third best for variation
        if (Math.random() < variationChance && validWaypoints.length > 1) {
            const index = Math.min(Math.floor(Math.random() * 3), validWaypoints.length - 1);
            return validWaypoints[index].waypoint;
        }
        
        return validWaypoints[0].waypoint;
    }

    // For non-first waypoints, occasionally pick suboptimal choices for variety
    if (Math.random() < variationChance && scoredWaypoints.length > 1) {
        const topChoices = scoredWaypoints.slice(0, Math.min(3, scoredWaypoints.length));
        const randomIndex = Math.floor(Math.random() * topChoices.length);
        return topChoices[randomIndex].waypoint;
    }

    return scoredWaypoints[0].waypoint;
}

/**
 * Selects waypoints ensuring diversity in route types
 */
function selectBestDiverseWaypoint(
    candidateWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    baseDistance: number,
    strategy: string,
    routeSoFar: SuggestedWaypoint[]
): SuggestedWaypoint | null {
    // Track types already used to promote diversity
    const usedTypes = new Set(routeSoFar.map(wp => wp.type));
    
    const scoredWaypoints = candidateWaypoints
        .filter(wp => wp.coordinates)
        .map(wp => {
            let score = scoreWaypoint(wp, currentPosition, end, baseDistance, strategy);
            // Bonus for new waypoint types
            if (!usedTypes.has(wp.type)) {
                score += 2;
            }
            return { waypoint: wp, score };
        })
        .filter(item => item.score > -Infinity)
        .sort((a, b) => b.score - a.score);

    return scoredWaypoints.length > 0 ? scoredWaypoints[0].waypoint : null;
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
    strategy: string
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
            isFirstWaypoint,
            route
        );

        if (!nextWaypoint) {
            break; // No more suitable waypoints found
        }
        
        route.push(nextWaypoint);
        currentPosition = nextWaypoint.coordinates!;
        availableWaypoints = availableWaypoints.filter(w => w.id !== nextWaypoint.id);
        isFirstWaypoint = false;
    }

    const totalDistance = calculateTotalDistance([start, ...route.map(r => r.coordinates!), end]);
    const totalTwistiness = route.reduce((sum, wp) => sum + (wp.twistiness || 0), 0);
    
    // Create more descriptive route names
    const routeName = generateRouteName(strategy, route);

    return {
        name: routeName,
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
    const usedWaypoints = new Set<string>(); // Track waypoints used by previous routes

    // Analyze available waypoints to determine which strategies are viable
    const waypointAnalysis = analyzeWaypoints(allWaypoints);
    const viableStrategies = determineViableStrategies(waypointAnalysis);
    
    // Generate routes with forced diversity - each route gets exclusive access to some waypoints
    for (const strategy of viableStrategies) {
        const availableWaypoints = allWaypoints.filter(wp => !usedWaypoints.has(wp.id));
        const route = generateRoute(availableWaypoints, start, end, strategy);
        
        if (route.waypoints.length > 0) {
            options.push(route);
            // Mark half of the waypoints as used to force diversity in subsequent routes
            route.waypoints.slice(0, Math.ceil(route.waypoints.length / 2))
                .forEach(wp => usedWaypoints.add(wp.id));
        }
    }

    // If we still need more routes, generate with relaxed exclusions
    const basicStrategies = ['Direct', 'Balanced', 'Twisty'];
    for (const strategy of basicStrategies) {
        if (!viableStrategies.includes(strategy) && options.length < 4) {
            const availableWaypoints = allWaypoints.filter(wp => 
                !usedWaypoints.has(wp.id) || Math.random() < 0.3 // Allow some reuse
            );
            const route = generateRoute(availableWaypoints, start, end, strategy);
            if (route.waypoints.length > 0) {
                options.push(route);
            }
        }
    }

    // Generate one more route with completely different waypoint selection for maximum diversity
    if (options.length > 0 && allWaypoints.length > 6) {
        const diversityRoute = generateDiversityRoute(allWaypoints, start, end, options);
        if (diversityRoute.waypoints.length > 0) {
            options.push(diversityRoute);
        }
    }

    // If no routes were generated, create a direct route as a fallback
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

    // Sort routes by variety and quality
    return options
        .sort((a, b) => {
            const aScore = a.waypoints.length + (a.totalTwistiness || 0) / 100;
            const bScore = b.waypoints.length + (b.totalTwistiness || 0) / 100;
            return bScore - aScore;
        })
        .slice(0, 6);
}

/**
 * Analyzes waypoints to understand what types are available
 */
function analyzeWaypoints(waypoints: SuggestedWaypoint[]) {
    const types = new Set(waypoints.map(wp => wp.type));
    const elevations = waypoints.map(wp => wp.elevation || 0);
    const maxElevation = Math.max(...elevations);
    const minElevation = Math.min(...elevations);
    const avgTwistiness = waypoints.reduce((sum, wp) => sum + (wp.twistiness || 0), 0) / waypoints.length;

    return {
        types,
        hasHighElevation: maxElevation > 1000,
        hasLowElevation: minElevation < 500,
        hasVariedElevation: (maxElevation - minElevation) > 500,
        hasTwistyRoads: avgTwistiness > 3,
        hasHistoric: types.has('monument') || types.has('castle') || types.has('historic') || types.has('museum'),
        hasAdventure: types.has('cave') || types.has('hot_spring') || types.has('recreation') || types.has('park'),
        hasNature: types.has('waterfall') || types.has('river') || types.has('peak') || types.has('viewpoint'),
        waypointCount: waypoints.length
    };
}

/**
 * Determines which strategies are viable based on waypoint analysis
 */
function determineViableStrategies(analysis: any): string[] {
    const strategies = ['Direct', 'Balanced', 'Twisty'];

    // Add specialized strategies based on available waypoints
    if (analysis.hasHighElevation && analysis.hasNature) {
        strategies.push('Mountain Route');
    }
    
    if (analysis.hasLowElevation || analysis.hasNature) {
        strategies.push('Valley Route');
    }
    
    if (analysis.hasAdventure) {
        strategies.push('Adventure Route');
    }
    
    if (analysis.hasHistoric) {
        strategies.push('Historic Route');
    }
    
    if (analysis.hasTwistyRoads && analysis.waypointCount > 5) {
        strategies.push('Scenic Loop');
    }

    return strategies;
}

/**
 * Generates a route that maximizes diversity from existing routes
 */
function generateDiversityRoute(
    allWaypoints: SuggestedWaypoint[],
    start: Coordinates,
    end: Coordinates,
    existingRoutes: RouteOption[]
): RouteOption {
    // Collect all waypoints used by existing routes
    const usedWaypointIds = new Set<string>();
    existingRoutes.forEach(route => {
        route.waypoints.forEach(wp => usedWaypointIds.add(wp.id));
    });

    // Prioritize unused waypoints
    const unusedWaypoints = allWaypoints.filter(wp => !usedWaypointIds.has(wp.id));
    const waypointsPool = unusedWaypoints.length > 3 ? unusedWaypoints : allWaypoints;

    // Generate route using unused waypoints with a focus on geographic spread
    let currentPosition = start;
    const route: SuggestedWaypoint[] = [];
    let availableWaypoints = [...waypointsPool];

    while (route.length < MAX_WAYPOINTS && availableWaypoints.length > 0) {
        // Score waypoints based on distance spread and diversity
        const baseDistance = calculateDistance(currentPosition, end);
        
        const scoredWaypoints = availableWaypoints
            .filter(wp => wp.coordinates)
            .map(wp => {
                const distanceToWaypoint = calculateDistance(currentPosition, wp.coordinates!);
                const distanceFromWaypointToEnd = calculateDistance(wp.coordinates!, end);
                
                // Prefer waypoints that aren't too far out of the way
                if (distanceFromWaypointToEnd > baseDistance * 1.3) {
                    return { waypoint: wp, score: -Infinity };
                }

                // Score based on diversity from existing routes
                let diversityScore = !usedWaypointIds.has(wp.id) ? 5 : 0;
                diversityScore += (wp.score || 0) + (wp.twistiness || 0) + (wp.strategicValue || 0);
                
                return { waypoint: wp, score: diversityScore };
            })
            .filter(item => item.score > -Infinity)
            .sort((a, b) => b.score - a.score);

        if (scoredWaypoints.length === 0) break;

        const selectedWaypoint = scoredWaypoints[0].waypoint;
        route.push(selectedWaypoint);
        currentPosition = selectedWaypoint.coordinates!;
        availableWaypoints = availableWaypoints.filter(w => w.id !== selectedWaypoint.id);
    }

    const totalDistance = calculateTotalDistance([start, ...route.map(r => r.coordinates!), end]);
    const totalTwistiness = route.reduce((sum, wp) => sum + (wp.twistiness || 0), 0);

    return {
        name: `Alternative Route (${route.length} unique stops)`,
        waypoints: route,
        start,
        end,
        totalDistance,
        totalTwistiness
    };
}

/**
 * Generates descriptive route names based on strategy and waypoints
 */
function generateRouteName(strategy: string, waypoints: SuggestedWaypoint[]): string {
    if (waypoints.length === 0) {
        return `${strategy} Route`;
    }

    const waypointTypes = waypoints.map(wp => wp.type);
    const hasElevation = waypoints.some(wp => wp.elevation && wp.elevation > 1000);
    const avgTwistiness = waypoints.reduce((sum, wp) => sum + (wp.twistiness || 0), 0) / waypoints.length;

    switch (strategy) {
        case 'Mountain Route':
            if (hasElevation) {
                return `Highland ${strategy} (${waypoints.length} stops)`;
            }
            return `Scenic ${strategy} (${waypoints.length} stops)`;
            
        case 'Valley Route':
            if (waypointTypes.includes('waterfall') || waypointTypes.includes('river')) {
                return `Riverside ${strategy} (${waypoints.length} stops)`;
            }
            return `Valley ${strategy} (${waypoints.length} stops)`;
            
        case 'Adventure Route':
            return `Outdoor ${strategy} (${waypoints.length} adventures)`;
            
        case 'Historic Route':
            return `Heritage ${strategy} (${waypoints.length} landmarks)`;
            
        case 'Scenic Loop':
            return `Scenic Loop (${waypoints.length} waypoints)`;
            
        case 'Twisty':
            if (avgTwistiness > 6) {
                return `Ultra-Twisty Route (${waypoints.length} curves)`;
            }
            return `Twisty Route (${waypoints.length} waypoints)`;
            
        case 'Balanced':
            return `Balanced Scenic Route (${waypoints.length} stops)`;
            
        case 'Direct':
            return `Direct Route (${waypoints.length} waypoints)`;
            
        default:
            return `${strategy} Route (${waypoints.length} waypoints)`;
    }
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

