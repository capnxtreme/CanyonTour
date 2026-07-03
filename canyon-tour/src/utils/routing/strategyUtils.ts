import { SuggestedWaypoint, Coordinates } from '../../types';
import { calculateDistance } from './geoUtils';
import * as geolib from 'geolib';

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

    // --- Hard Rules: Immediately disqualify undesirable road types for scenic routes ---
    const isScenicStrategy = ['Twisty', 'Valley Route', 'Mountain Route', 'Scenic Loop', 'Adventure Route'].includes(strategy);
    if (isScenicStrategy) {
        const highwayType = waypoint.tags?.highway;
        if (highwayType === 'motorway' || highwayType === 'trunk' || highwayType === 'motorway_link' || highwayType === 'trunk_link') {
            if (process.env.NODE_ENV === 'development') {
                console.log(`DISQUALIFIED: ${waypoint.description || waypoint.location} is a freeway/trunk road.`);
            }
            return -Infinity;
        }
    }

    const distanceToWaypoint = calculateDistance(currentPosition, waypoint.coordinates);
    const distanceFromWaypointToEnd = calculateDistance(waypoint.coordinates, end);
    const totalRouteDistance = distanceToWaypoint + distanceFromWaypointToEnd;
    
    // Calculate detour as the difference between the total route and the base distance
    // Both are straight line distances, so this gives us the actual detour
    const detourDistance = totalRouteDistance - baseDistance;
    
    // Apply driving multiplier to get estimated driving detour
    const estimatedDrivingDetour = detourDistance * 1.4;
    
    // Debug logging for Lyons Valley Road to understand detour calculation
    if (process.env.NODE_ENV === 'development' && waypoint.description?.toLowerCase().includes('lyons')) {
        console.log(`DETOUR DEBUG - ${waypoint.description}:`, {
            distanceToWaypoint: distanceToWaypoint.toFixed(2),
            distanceFromWaypointToEnd: distanceFromWaypointToEnd.toFixed(2),
            totalThroughWaypoint: totalRouteDistance.toFixed(2),
            baseDistance: baseDistance.toFixed(2),
            detourDistance: detourDistance.toFixed(2),
            estimatedDrivingDetour: estimatedDrivingDetour.toFixed(2),
            strategy: strategy
        });
    }

    // Base scoring factors
    const twistiness = waypoint.twistiness || 0;
    const elevation = waypoint.elevation || 0;
    const score = waypoint.score || 0;
    const strategicValue = waypoint.strategicValue || 0;

    // Strategy-specific scoring
    let finalScore = 0;

    switch (strategy) {
        case 'Twisty':
            finalScore = (twistiness * 8.0) + strategicValue;
            
            const roadType = waypoint.tags?.highway;
            // SIGNIFICANTLY increased secondary road bonus to favor Lyons Valley Road type roads
            if (roadType === 'secondary') finalScore += 30.0; // Increased from 10.0
            else if (roadType === 'tertiary') finalScore += 20.0; // Increased from 5.0
            else if (roadType === 'unclassified') finalScore += 25.0; // New bonus for rural roads
            
            // Enhanced valley road detection
            const isValleyRoad = waypoint.tags?.natural === 'valley' || 
                                waypoint.description?.toLowerCase().includes('valley') ||
                                waypoint.location?.toLowerCase().includes('valley');
            if (isValleyRoad) finalScore += 20.0; // Increased from 6.0

            // --- Enhanced bonuses for ideal road characteristics ---
            const lanes = waypoint.tags?.lanes ? parseInt(waypoint.tags.lanes) : 0;
            if (lanes === 2) {
                finalScore += 25.0; // Increased from 15.0 - Strong bonus for being a 2-lane road
            } else if (lanes === 3 || lanes === 4) {
                finalScore += 10.0; // Moderate bonus for 3-4 lanes
            }

            const maxSpeed = waypoint.tags?.maxspeed ? parseInt(waypoint.tags.maxspeed) : 0;
            if (maxSpeed >= 45 && maxSpeed <= 65) {
                finalScore += 15.0; // Increased from 10.0 - Strong bonus for ideal speed limits
            }

            // Strongly penalize straight roads
            if ((twistiness || 0) < 0.5) finalScore -= 10.0;
            
            // Big bonus for high twistiness
            if (twistiness > 2.0) {
                finalScore += 12.0; // Increased from 8.0
            }

            break;

        case 'Balanced':
            finalScore = (twistiness * 1.8) + strategicValue + (elevation / 800) + (score * 0.8);
            
            // Balanced route prefers moderate values
            if (twistiness > 1.0 && twistiness < 3.0) {
                finalScore += 1.5;
            } else if (twistiness > 4.0 || twistiness < 0.5) { // Penalize extremes
                finalScore -= 2.0;
            }
            if (elevation > 200 && elevation < 1000) {
                finalScore += 1.0;
            } else if (elevation > 1500 || elevation < 100) { // Penalize extremes
                finalScore -= 2.0;
            }
            break;

        case 'Direct':
            finalScore = strategicValue - (twistiness * 2.0);
            
            // Add a bonus for waypoints that are roughly perpendicular to the direct line to the destination
            const bearingToWaypoint = geolib.getGreatCircleBearing(currentPosition, waypoint.coordinates);
            const bearingToEnd = geolib.getGreatCircleBearing(currentPosition, end);
            const angleDifference = Math.abs(bearingToWaypoint - bearingToEnd);
            if (angleDifference > 45 && angleDifference < 135) {
                finalScore += 10; // Bonus for perpendicular direction
            }
            break;

        case 'Scenic Loop':
            // Favor waypoints that create interesting loops and circles back
            finalScore = (twistiness * 2.0) + (score * 3) + strategicValue;
            
            // Bonus for waypoints that might create good loops
            const distanceFromStart = calculateDistance(currentPosition, waypoint.coordinates);
            const angleFromDirect = Math.abs(Math.atan2(
                waypoint.coordinates.lat - currentPosition.lat,
                waypoint.coordinates.lon - currentPosition.lon
            ) - Math.atan2(
                end.lat - currentPosition.lat,
                end.lon - currentPosition.lon
            ));
            
            // Bonus for waypoints that are perpendicular to the direct route
            if (angleFromDirect > Math.PI/3 && angleFromDirect < 2*Math.PI/3) {
                finalScore += 4.0;
            }
            
            // Bonus for being a good distance away from start and end
            if (distanceFromStart > baseDistance * 0.2 && distanceFromWaypointToEnd > baseDistance * 0.2) {
                finalScore += 3.0;
            }
            break;

        case 'Mountain Route':
            // Prioritize elevation and mountain features
            const elevationBonus = elevation > 800 ? (elevation / 200) : 0;
            const highElevationBonus = elevation > 1500 ? 5 : 0;
            const mountainBonus = (waypoint.type === 'peak' || waypoint.type === 'mountain' || 
                                 waypoint.type === 'viewpoint') ? 15 : 0;
            const mountainNameBonus = (waypoint.description?.toLowerCase().includes('mountain') ||
                                     waypoint.description?.toLowerCase().includes('peak') ||
                                     waypoint.description?.toLowerCase().includes('summit')) ? 8 : 0;
            
            finalScore = elevationBonus + highElevationBonus + mountainBonus + mountainNameBonus + 
                        (twistiness * 0.8) + strategicValue;
            
            // Penalize low elevation waypoints
            if (elevation < 300) {
                finalScore -= 5.0; // Increased penalty from 3.0
            }
            if (waypoint.elevation && waypoint.elevation > 1000) {
                finalScore += 10.0;
            }
            break;

        case 'Valley Route': {
            // ENHANCED Valley Road Detection - specifically targeting Lyons Valley Road characteristics
            const hasValleyInName = waypoint.description?.toLowerCase().includes('valley') ||
                                   waypoint.location?.toLowerCase().includes('valley') ||
                                   waypoint.tags?.name?.toLowerCase().includes('valley') ||
                                   waypoint.tags?.alt_name?.toLowerCase().includes('valley');
            
            if (hasValleyInName) {
                finalScore += 40.0; // MASSIVE bonus for valley roads like Lyons Valley Road
            }

            // PRIORITIZE (from rules):
            // - 2 lane roads (now as a bonus, not a filter)
            const lanes = waypoint.tags?.lanes ? parseInt(waypoint.tags.lanes) : 0;
            if (lanes === 2) {
                finalScore += 35.0; // Increased from 25.0 - Very strong bonus for being a 2-lane road
            } else if (lanes === 3 || lanes === 4) {
                finalScore += 15.0; // Moderate bonus for 3-4 lanes
            } else if (lanes > 4) {
                finalScore -= (lanes - 4) * 8.0; // Penalize for each lane above 4
            }

            // - "secondary" roads - ENHANCED
            const roadType = waypoint.tags?.highway;
            if (roadType === 'secondary') {
                finalScore += 35.0; // Increased from 20.0 - HUGE bonus for secondary roads
            } else if (roadType === 'tertiary') {
                finalScore += 25.0; // Also good for valley routes
            } else if (roadType === 'unclassified') {
                finalScore += 30.0; // Often rural valley roads
            }

            // - roads with speed limit 45-65mph
            const maxSpeedStr = waypoint.tags?.maxspeed?.replace(/[^\d]/g, ''); // Remove non-digits
            const hasGoodSpeed = maxSpeedStr && 
                parseInt(maxSpeedStr) >= 45 && 
                parseInt(maxSpeedStr) <= 65;
            if (hasGoodSpeed) {
                finalScore += 15.0; // Increased from 5.0
            }

            // BONUS for continuous road segments (like Lyons Valley Road's 11 segments)
            const roadName = waypoint.tags?.name || waypoint.description || waypoint.location || '';
            if (roadName.length > 0) {
                finalScore += 10.0; // Bonus for named roads
            }

            // DE-PRIORITIZE (from rules):
            // - roads that are not twisty (handled by twistiness score)

            // EXCLUDE (from rules):
            // - unpaved roads
            const isUnpaved = waypoint.tags?.surface && ['unpaved', 'dirt', 'gravel', 'ground'].includes(waypoint.tags.surface);
            if (isUnpaved) return -Infinity;

            // - roads less than 2 lanes
            if (lanes > 0 && lanes < 2) return -Infinity;

            // Add base factors with increased twistiness weight for valley routes
            finalScore += (twistiness * 6.0) + strategicValue; // Increased from 4.0
            
            // Bonus for high twistiness valley roads
            if (twistiness > 2.0 && hasValleyInName) {
                finalScore += 20.0; // Special bonus for twisty valley roads
            }

            break;
        }

        case 'Adventure Route':
            // Favor adventure and outdoor activity waypoints
            const adventureBonus = (waypoint.type === 'cave' || waypoint.type === 'hot_spring' ||
                                  waypoint.type === 'recreation' || waypoint.type === 'park') ? 15 : 0;
            const outdoorBonus = (waypoint.description?.toLowerCase().includes('trail') ||
                                waypoint.description?.toLowerCase().includes('camp') ||
                                waypoint.description?.toLowerCase().includes('hike')) ? 8 : 0;
            const remoteBonus = (waypoint.description?.toLowerCase().includes('remote') ||
                               waypoint.description?.toLowerCase().includes('wilderness')) ? 6 : 0;
            
            finalScore = adventureBonus + outdoorBonus + remoteBonus + (twistiness * 0.8) + 
                        strategicValue + score;
            break;

        case 'Historic Route':
            // Prioritize historic and cultural waypoints
            const historicBonus = (waypoint.type === 'monument' || waypoint.type === 'castle' ||
                                 waypoint.type === 'historic' || waypoint.type === 'museum') ? 18 : 0;
            const culturalBonus = (waypoint.description?.toLowerCase().includes('historic') ||
                                 waypoint.description?.toLowerCase().includes('heritage') ||
                                 waypoint.description?.toLowerCase().includes('monument')) ? 10 : 0;
            const oldBonus = (waypoint.description?.toLowerCase().includes('old') ||
                            waypoint.description?.toLowerCase().includes('ancient')) ? 6 : 0;
            
            finalScore = historicBonus + culturalBonus + oldBonus + strategicValue + 
                        (score * 0.8);
            
            // Slight penalty for high twistiness (historic routes often on older, straighter roads)
            if (twistiness > 2.5) {
                finalScore -= 1.0;
            }

            // Bonus for proximity to other historical points (this is hard to calculate here, so we give a bonus to high strategic value instead)
            if (strategicValue > 0.8) {
                finalScore += 5.0;
            }
            break;

        default:
            finalScore = twistiness + strategicValue;
            if (distanceFromWaypointToEnd > baseDistance) {
                return -Infinity;
            }
    }

    // --- Detour, Overshoot, and Final Scoring ---

    // 1. REVISED Detour Penalty: Much more generous budget for scenic roads
    let detourPenalty = 0;
    
    // Strategy-specific detour tolerance
    const strategyDetourBudget: Record<string, number> = {
        'Twisty': twistiness * 5000 + 10000, // 5km per twistiness point + 10km base
        'Valley Route': twistiness * 4000 + 8000, // 4km per twistiness point + 8km base
        'Mountain Route': twistiness * 4000 + 8000,
        'Scenic Loop': twistiness * 6000 + 15000, // Very generous for loops
        'Adventure Route': twistiness * 3000 + 6000,
        'Balanced': twistiness * 3000 + 5000,
        'Direct': twistiness * 1000 + 2000,
        'Historic Route': twistiness * 2000 + 4000
    };
    
    const detourBudget = strategyDetourBudget[strategy] || (twistiness * 2500);
    
    if (detourDistance > detourBudget) {
        // Much gentler penalty curve
        const excessDetour = detourDistance - detourBudget;
        // Linear penalty instead of quadratic, and much smaller coefficient
        detourPenalty = Math.min(excessDetour / 1000, 15); // Max 15 point penalty
    }
    
    // The final score is adjusted by the calculated penalties
    let finalScoreFromStrategy = finalScore || 0;
    finalScoreFromStrategy = finalScoreFromStrategy - detourPenalty;

    if (process.env.NODE_ENV === 'development' && (waypoint.description?.toLowerCase().includes('lyons') || waypoint.description?.toLowerCase().includes('japatul'))) {
        console.log(`%c[Score Calculation] ${waypoint.description}:
    - Strategy: ${strategy}
    - Initial Score (Twistiness, Bonuses): ${(finalScoreFromStrategy + detourPenalty).toFixed(2)}
    - Detour Penalty: ${detourPenalty.toFixed(2)} (Budget: ${(twistiness * 2500).toFixed(0)}m, Actual: ${detourDistance.toFixed(0)}m)
    - Final Score: ${finalScoreFromStrategy.toFixed(2)}`,
            'color: #FFA500;'
        );
    }

    // Ensure score is not negative
    if (finalScoreFromStrategy < 0) {
        finalScoreFromStrategy = 0;
    }
    
    return finalScoreFromStrategy;
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
            
            if (filteredWaypoints.length < 3 && waypoints.length > 3) {
                filteredWaypoints = waypoints
                    .sort((a, b) => (a.elevation || 0) - (b.elevation || 0))
                    .slice(0, Math.max(waypoints.length / 2, 5));
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