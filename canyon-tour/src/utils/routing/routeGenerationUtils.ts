import { SuggestedWaypoint, Coordinates, RouteOption } from '../../types';
import { calculateDistance } from './geoUtils';
import { filterWaypointsForStrategy, determineViableStrategies, analyzeWaypoints } from './strategyUtils';
import { selectNextWaypoint, ScoredWaypoint } from './waypointSelectionUtils';
import { getDirections } from '../../services/googleMapsService';
import { analyzeRouteForOutAndBack, calculateRouteContinuity } from './routeAnalysis';

const MAX_WAYPOINTS = 10;
// Strategy-specific minimum scores to allow scenic roads like Lyons Valley Road
const MINIMUM_WAYPOINT_SCORES: Record<string, number> = {
    'Twisty': 8.0,        // Reduced from 12.0 to include more twisty roads
    'Valley Route': 6.0,   // Very low threshold for valley roads
    'Mountain Route': 10.0,
    'Scenic Loop': 8.0,
    'Adventure Route': 8.0,
    'Balanced': 10.0,
    'Direct': 15.0,       // Keep high for direct routes
    'Historic Route': 8.0
};

async function generateRoute(
    allWaypoints: SuggestedWaypoint[],
    start: Coordinates,
    end: Coordinates,
    strategy: string,
    forcedStartWaypoint?: SuggestedWaypoint
): Promise<RouteOption | null> {
    const waypointsForStrategy = filterWaypointsForStrategy(allWaypoints, strategy);
    
    let currentPosition = start;
    const route: SuggestedWaypoint[] = [];
    let availableWaypoints = [...waypointsForStrategy];
    let isFirstWaypoint = true;
    let previousPosition: Coordinates | null = null;

    if (forcedStartWaypoint) {
        route.push(forcedStartWaypoint);
        previousPosition = currentPosition;
        currentPosition = forcedStartWaypoint.coordinates!;
        availableWaypoints = availableWaypoints.filter(wp => wp.id !== forcedStartWaypoint.id);
        isFirstWaypoint = false;
    }

    while (route.length < MAX_WAYPOINTS) {
        const nextWaypointResult = selectNextWaypoint(availableWaypoints, currentPosition, end, strategy, isFirstWaypoint, route, previousPosition);

        let nextWaypoint: SuggestedWaypoint | null = null;
        let waypointScore = 0;
        
        if (Array.isArray(nextWaypointResult)) {
            if (nextWaypointResult.length > 0) {
                // If it's an array (only happens on first waypoint), take the best candidate
                nextWaypoint = nextWaypointResult[0].waypoint;
                waypointScore = nextWaypointResult[0].score;
            }
        } else if (nextWaypointResult) {
            // Otherwise, it's a single ScoredWaypoint or null
            nextWaypoint = nextWaypointResult.waypoint;
            waypointScore = nextWaypointResult.score;
        }
        
        // --- QUALITY CONTROL: Stop if the best available waypoint isn't good enough ---
        const minimumScore = MINIMUM_WAYPOINT_SCORES[strategy] || 10.0;
        if (!isFirstWaypoint && waypointScore < minimumScore) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`${strategy}: Stopping waypoint selection - best candidate score (${waypointScore.toFixed(2)}) is below threshold (${minimumScore})`);
            }
            break;
        }

        if (nextWaypoint) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`${strategy}: Selected waypoint ${route.length + 1}: ${nextWaypoint.description || nextWaypoint.location} (score: ${waypointScore.toFixed(2)}, twistiness: ${nextWaypoint.twistiness?.toFixed(2)})`);
            }
            
            route.push(nextWaypoint);
            previousPosition = currentPosition;
            currentPosition = nextWaypoint.coordinates!;
            
            // Remove the selected waypoint from available waypoints to avoid picking it again
            availableWaypoints = availableWaypoints.filter(wp => wp.id !== nextWaypoint!.id);
            isFirstWaypoint = false;
            
            // If the route gets close to the destination, stop adding waypoints if it's not a loop
            // Be more lenient for scenic strategies to allow more comprehensive routes
            let terminationDistance = 8000; // Default 8km
            if (strategy === 'Valley Route' || strategy === 'Twisty' || strategy === 'Mountain Route') {
                terminationDistance = 5000; // Allow waypoints closer to destination for scenic routes
            } else if (strategy === 'Scenic Loop') {
                terminationDistance = 0; // No early termination for loops
            }
            
            if (strategy !== 'Scenic Loop' && terminationDistance > 0 && calculateDistance(currentPosition, end) < terminationDistance) {
                if (process.env.NODE_ENV === 'development') {
                    console.log(`${strategy}: Stopping waypoint selection - within ${terminationDistance/1000}km of destination`);
                }
                break;
            }
        } else {
            // No more suitable waypoints found
            if (process.env.NODE_ENV === 'development') {
                console.log(`No more waypoints found for ${strategy} strategy after ${route.length} waypoints`);
            }
            break; 
        }
    }
    
    if (route.length === 0) {
        console.log(`No waypoints selected for ${strategy}, aborting route generation.`);
        return null;
    }

    // Fetch real directions from Google
    const waypointCoords = route.map(wp => wp.coordinates!);
    const directionsResult = await getDirections(start, end, waypointCoords);

    if (!directionsResult) {
        console.log(`Could not fetch directions for ${strategy} route.`);
        return null;
    }

    // ANALYZE ROUTE FOR OUT-AND-BACK PATTERNS
    const routeAnalysis = analyzeRouteForOutAndBack(directionsResult);
    const continuityScore = calculateRouteContinuity(directionsResult);

    if (process.env.NODE_ENV === 'development') {
        console.log(`%c[Route Analysis] ${strategy}: ${routeAnalysis.analysis} (Continuity Score: ${continuityScore.toFixed(2)})`, 
                   routeAnalysis.hasOutAndBack ? 'color: #FF6B6B;' : 'color: #51CF66;');
    }

    // REJECT ROUTES WITH SIGNIFICANT OUT-AND-BACK PATTERNS
    // Allow some tolerance for scenic routes, but reject egregious backtracking
    const maxBacktrackThreshold = strategy === 'Scenic Loop' ? 25 : 
                                 strategy === 'Direct' ? 8 : 18; // Percentage

    if (routeAnalysis.backtrackPercentage > maxBacktrackThreshold) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`%c[Route Rejected] ${strategy} route rejected due to excessive backtracking: ${routeAnalysis.backtrackPercentage.toFixed(1)}% > ${maxBacktrackThreshold}%`, 'color: #FF474C;');
        }
        return null; // Reject this route
    }

    // Extract real distance and duration from the Google Maps result
    const totalDistance = directionsResult.routes[0].legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
    const totalDuration = directionsResult.routes[0].legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);

    return {
        strategy,
        name: generateRouteName(strategy, route),
        waypoints: route,
        distance: totalDistance / 1000, // convert to km
        duration: totalDuration / 60, // convert to minutes
        directions: directionsResult, // The full directions object
        description: `A ${strategy.toLowerCase()} route with ${route.length} waypoints. (${routeAnalysis.backtrackPercentage.toFixed(1)}% backtrack)`,
        continuityScore, // Add continuity score for later sorting
        routeAnalysis // Include full analysis for debugging
    };
}

export async function generateRouteOptions(
    allWaypoints: SuggestedWaypoint[],
    start: Coordinates,
    end: Coordinates
): Promise<RouteOption[]> {
    if (process.env.NODE_ENV === 'development') {
        console.log("Generating route options...");
    }

    const waypointAnalysis = analyzeWaypoints(allWaypoints);
    const viableStrategies = determineViableStrategies(waypointAnalysis);

    if (process.env.NODE_ENV === 'development') {
        console.log("Viable strategies:", viableStrategies);
    }
    
    const routePromises: Promise<RouteOption | null>[] = [];
    
    for (const strategy of viableStrategies) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`Generating route for strategy: ${strategy}`);
        }
        
        // Find top candidate waypoints for the start of the route
        const waypointsForStrategy = filterWaypointsForStrategy(allWaypoints, strategy);
        const initialCandidatesResult = selectNextWaypoint(waypointsForStrategy, start, end, strategy, true);

        if (!initialCandidatesResult || !Array.isArray(initialCandidatesResult) || initialCandidatesResult.length === 0) {
            if (process.env.NODE_ENV === 'development') {
                console.log(`No initial waypoints found for strategy: ${strategy}`);
            }
            continue;
        }
        
        const initialCandidates = initialCandidatesResult as ScoredWaypoint[];
        
        // Generate the primary route with the best candidate
        const primaryCandidate = initialCandidates[0];
        routePromises.push(generateRoute(allWaypoints, start, end, strategy, primaryCandidate.waypoint));

        // Generate alternative routes for other strong candidates
        if (initialCandidates.length > 1) {
            const primaryScore = primaryCandidate.score;
            
            for (let i = 1; i < Math.min(initialCandidates.length, 3); i++) { // Max 2 alternatives
                const alternativeCandidate = initialCandidates[i];
                const alternativeScore = alternativeCandidate.score;

                // Only generate alternative if its score is very close to the primary
                if (alternativeScore > primaryScore * 0.95) { // at least 95% of the primary score
                    routePromises.push(generateRoute(allWaypoints, start, end, strategy, alternativeCandidate.waypoint));
                }
            }
        }
    }

    const generatedRoutes = (await Promise.all(routePromises)).filter((route): route is RouteOption => route !== null);

    // Post-process names for alternatives
    generatedRoutes.forEach(route => {
        const firstWp = route.waypoints[0];
        // A bit of a heuristic to see if it was an alternative
        if (route.name.startsWith(route.strategy || '')) { 
            const primaryRouteForStrategy = generatedRoutes.find(r => r.strategy === route.strategy && r.name === route.strategy);
            if (primaryRouteForStrategy && primaryRouteForStrategy.waypoints[0].id !== firstWp.id) {
                 const firstWaypointName = firstWp.location || firstWp.description || 'Alternative';
                 route.name = `${route.strategy} (via ${firstWaypointName})`;
                 route.description = `An alternative ${route.strategy?.toLowerCase()} route starting with ${firstWaypointName}.`;
            }
        }
    });

    // Add exploration routes that focus on different geographical areas
    const usedWaypointSetsForExploration = generatedRoutes.map(r => new Set(r.waypoints.map(wp => wp.id)));
    const explorationRoutes = await generateExplorationRoutes(allWaypoints, start, end, usedWaypointSetsForExploration);
    generatedRoutes.push(...explorationRoutes);
    
    // Sort routes by a composite quality metric that considers diversity
    generatedRoutes.sort((a, b) => {
        const aScore = calculateRouteQuality(a);
        const bScore = calculateRouteQuality(b);
        return bScore - aScore;
    });

    if (process.env.NODE_ENV === 'development') {
        console.log(`Generated ${generatedRoutes.length} valid route options after fetching directions.`);
        generatedRoutes.forEach(route => {
            console.log(`  - ${route.name}: ${route.waypoints.length} waypoints, quality score: ${calculateRouteQuality(route).toFixed(2)}`);
        });
    }

    // Limit to best 8 routes to avoid overwhelming the user
    return generatedRoutes.slice(0, 8);
}

function calculateRouteQuality(route: RouteOption): number {
    const waypointCount = route.waypoints.length;
    const totalTwistiness = route.waypoints.reduce((acc, wp) => acc + (wp.twistiness || 0), 0);
    const averageTwistiness = waypointCount > 0 ? totalTwistiness / waypointCount : 0;
    
    // Base scoring components
    const qualityScore = averageTwistiness * 3; // Emphasize average quality
    const quantityBonus = Math.min(waypointCount * 0.3, 2); // Reduced quantity bonus
    const totalTwistinessScore = totalTwistiness * 0.5; // Reduced total twistiness weight
    
    // Special bonus for valley routes (like Lyons Valley Road)
    const hasValleyWaypoints = route.waypoints.some(wp => 
        wp.description?.toLowerCase().includes('valley') || 
        wp.location?.toLowerCase().includes('valley')
    );
    const valleyBonus = hasValleyWaypoints ? 3 : 0;
    
    // MAJOR BONUS FOR ROUTE CONTINUITY - this heavily favors routes without out-and-back patterns
    const continuityBonus = (route.continuityScore || 0.5) * 15; // Up to 15 points for perfect continuity
    
    // Penalty for routes with known backtracking issues
    const backtrackPenalty = route.routeAnalysis?.hasOutAndBack ? -5 : 0;
    
    const baseScore = qualityScore + quantityBonus + totalTwistinessScore + valleyBonus;
    const finalScore = baseScore + continuityBonus + backtrackPenalty;
    
    if (process.env.NODE_ENV === 'development') {
        console.log(`Quality Score for ${route.name}: Base=${baseScore.toFixed(1)}, Continuity=${continuityBonus.toFixed(1)}, Final=${finalScore.toFixed(1)}`);
    }
    
    return finalScore;
}

async function generateExplorationRoutes(
    allWaypoints: SuggestedWaypoint[],
    start: Coordinates,
    end: Coordinates,
    usedWaypointSets: Set<string>[]
): Promise<RouteOption[]> {
    const explorationRoutes: Promise<RouteOption | null>[] = [];
    
    // Get waypoints that haven't been heavily used
    const underusedWaypoints = allWaypoints.filter(wp => {
        const usageCount = usedWaypointSets.filter(set => set.has(wp.id)).length;
        return usageCount <= 1; // Used in at most 1 route
    });
    
    if (underusedWaypoints.length >= 5) {
        // Generate a "Hidden Gems" route focusing on less common waypoints
        const hiddenGemsRoutePromise = generateRoute(underusedWaypoints, start, end, 'Adventure Route');
        explorationRoutes.push(hiddenGemsRoutePromise);
    }
    
    // Generate geographical diversity routes
    const midpoint = {
        lat: (start.lat + end.lat) / 2,
        lon: (start.lon + end.lon) / 2
    };
    
    // Northern route (waypoints north of midpoint)
    const northernWaypoints = allWaypoints.filter(wp => 
        wp.coordinates && wp.coordinates.lat > midpoint.lat
    );
    
    if (northernWaypoints.length >= 3) {
        const northernStrategy = northernWaypoints.some(wp => (wp.elevation || 0) > 800) ? 'Mountain Route' : 'Twisty';
        const northernRoutePromise = generateRoute(northernWaypoints, start, end, northernStrategy);
        explorationRoutes.push(northernRoutePromise);
    }
    
    // Southern route (waypoints south of midpoint)
    const southernWaypoints = allWaypoints.filter(wp => 
        wp.coordinates && wp.coordinates.lat < midpoint.lat
    );
    
    if (southernWaypoints.length >= 3) {
        const southernStrategy = southernWaypoints.some(wp => wp.description?.toLowerCase().includes('valley')) ? 'Valley Route' : 'Balanced';
        const southernRoutePromise = generateRoute(southernWaypoints, start, end, southernStrategy);
        explorationRoutes.push(southernRoutePromise);
    }

    const validExplorationRoutes = (await Promise.all(explorationRoutes)).filter((route): route is RouteOption => route !== null);
    
    // Post-process names
    validExplorationRoutes.forEach(route => {
        if (route.strategy === 'Hidden Gems' || route.strategy === 'Adventure Route') {
            route.name = 'Hidden Gems Explorer';
            route.description = 'Discover lesser-known scenic spots and roads.';
        } else if (route.waypoints.some(wp => wp.coordinates && wp.coordinates.lat > midpoint.lat)) {
            route.name = 'Northern Explorer';
            route.description = 'Explore scenic routes to the north.';
        } else {
            route.name = 'Southern Explorer';
            route.description = 'Explore scenic routes to the south.';
        }
    });

    return validExplorationRoutes;
}

function generateRouteName(strategy: string, waypoints: SuggestedWaypoint[]): string {
    if (waypoints.length === 0) {
        return `${strategy} Discovery`;
    }

    const mostSignificantWaypoint = waypoints.reduce((prev, current) => 
        ((prev.twistiness || 0) > (current.twistiness || 0)) ? prev : current
    );

    const mainFeature = mostSignificantWaypoint.description || 'Scenic Roads';

    switch (strategy) {
        case 'Twisty':
            return `Twisty Roads via ${mainFeature}`;
        case 'Scenic Loop':
            return `Scenic Loop around ${mainFeature}`;
        case 'Mountain Route':
            return `Mountain Adventure to ${mainFeature}`;
        case 'Valley Route':
            return `Valley Explorer through ${mainFeature}`;
        case 'Adventure Route':
            return `Adventure Seeker to ${mainFeature}`;
        case 'Historic Route':
            return `Historic Journey to ${mainFeature}`;
        default:
            return `${strategy} Route via ${mainFeature}`;
    }
} 