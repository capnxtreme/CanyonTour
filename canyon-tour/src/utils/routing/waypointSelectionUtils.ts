import { SuggestedWaypoint, Coordinates } from '../../types';
import { calculateDistance } from './geoUtils';
import { scoreWaypoint } from './strategyUtils';
import * as geolib from 'geolib';

// Define a type for a waypoint that has been scored
export interface ScoredWaypoint {
    waypoint: SuggestedWaypoint;
    score: number;
}

// A simple normalization function to compare road names more robustly
const normalizeLocation = (name: string | undefined): string => {
    if (!name) return '';
    // Lowercase, remove punctuation, and common road type suffixes
    return name.toLowerCase()
        .replace(/[.,]/g, '')
        .replace(/\s+(rd|road|ln|lane|dr|drive|st|street|ave|avenue|blvd|boulevard|ct|court|pl|place|pkwy|parkway|ter|terrace|trl|trail)$/, '')
        .trim();
};

function selectNextWaypoint(
    availableWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    strategy: string,
    isFirstWaypoint: boolean,
    routeSoFar: SuggestedWaypoint[] = [],
    previousPosition: Coordinates | null = null
): ScoredWaypoint | ScoredWaypoint[] | null {
    // Use straight line distance as baseline - we'll apply the driving multiplier consistently
    const baseDistance = calculateDistance(currentPosition, end);
    
    // Removed noisy distance calculation logging
    
    // Filter out waypoints that are too far from the start, especially for the first waypoint.
    const firstWaypointRelaxation = 35000; // 35km search radius for the first hop
    const nearbyWaypoints = availableWaypoints.filter(wp => {
        if (!wp.coordinates) return false;
        const distFromStart = calculateDistance(currentPosition, wp.coordinates);
        return isFirstWaypoint ? distFromStart < firstWaypointRelaxation : true;
    });

    if (nearbyWaypoints.length === 0) {
        console.log("No nearby waypoints found, even after relaxation. Considering all available waypoints.");
        nearbyWaypoints.push(...availableWaypoints);
    }

    // Verbose candidate logging moved to verbose mode only
    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
        const sortedForDebug = [...nearbyWaypoints]
            .map(wp => ({ ...wp, score: scoreWaypoint(wp, currentPosition, end, baseDistance, strategy) }))
            .sort((a, b) => b.score - a.score);
        console.log(`Top 5 candidates for ${strategy}:`, sortedForDebug.slice(0, 5).map(wp => 
            `${wp.description || 'Unnamed'}: score=${wp.score.toFixed(2)}, twist=${wp.twistiness?.toFixed(2)}`
        ));
        
        // Special debug for Lyons Valley Road
        const lyonsWaypoints = sortedForDebug.filter(wp => 
            wp.location?.toLowerCase().includes('lyons') || wp.description?.toLowerCase().includes('lyons')
        );
        if (lyonsWaypoints.length > 0) {
            console.log(`  - Lyons waypoints in candidates (${lyonsWaypoints.length}):`, 
                lyonsWaypoints.slice(0, 3).map(wp => 
                    `${wp.description || wp.location}: score=${wp.score.toFixed(2)}, twist=${wp.twistiness?.toFixed(2)}`
                )
            );
        } else {
            console.log(`  - No Lyons waypoints found in ${nearbyWaypoints.length} nearby candidates for ${strategy}`);
        }
    }

    return selectBestDiverseWaypoint(nearbyWaypoints, currentPosition, end, baseDistance, strategy, routeSoFar, previousPosition, isFirstWaypoint);
}

// Turns sharper than this relative to the incoming direction of travel are
// treated as U-turns (retracing steps) and are excluded outright.
const MAX_TURN_ANGLE_DEGREES = 160;

function selectBestDiverseWaypoint(
    candidateWaypoints: SuggestedWaypoint[],
    currentPosition: Coordinates,
    end: Coordinates,
    baseDistance: number,
    strategy: string,
    routeSoFar: SuggestedWaypoint[],
    previousPosition: Coordinates | null,
    isFirstWaypoint: boolean
): ScoredWaypoint[] | ScoredWaypoint | null {
    if (candidateWaypoints.length === 0) return null;

    const lastWaypoint = routeSoFar.length > 0 ? routeSoFar[routeSoFar.length - 1] : null;

    let scoredWaypoints = candidateWaypoints
        .map(wp => {
            const score = scoreWaypoint(wp, currentPosition, end, baseDistance, strategy);
            return { waypoint: wp, score };
        });

    // --- Add penalties based on route shape ---
    
    // 1. Penalize coming too close to any point already in the route to prevent retracing steps.
    scoredWaypoints.forEach(item => {
        if (routeSoFar.length > 0 && item.waypoint.coordinates) {
            for (const prevWp of routeSoFar) {
                const distance = calculateDistance(item.waypoint.coordinates, prevWp.coordinates!);
                if (distance < 1500) { // 1.5km is too close
                    const originalScore = item.score;
                    item.score *= 0.1; // Heavy penalty
                    if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true' && (item.waypoint.location?.toLowerCase().includes('lyons') || item.waypoint.location?.toLowerCase().includes('japatul'))) {
                        console.log(`%c[Penalty Applied] Proximity penalty for ${item.waypoint.location}. Score reduced from ${originalScore.toFixed(2)} to ${item.score.toFixed(2)}`, 'color: #FF474C;');
                    }
                }
            }
        }
    });
    
    // 2. Exclude waypoints that would force a U-turn relative to the incoming
    // direction of travel (rule: never retrace steps; loops are fine).
    if (previousPosition) {
        const incomingBearing = geolib.getGreatCircleBearing(previousPosition, currentPosition);
        scoredWaypoints.forEach(item => {
            if (!item.waypoint.coordinates) return;
            const outgoingBearing = geolib.getGreatCircleBearing(currentPosition, item.waypoint.coordinates);
            const angleDiff = Math.abs(incomingBearing - outgoingBearing);
            const turnAngle = Math.min(angleDiff, 360 - angleDiff);
            if (turnAngle > MAX_TURN_ANGLE_DEGREES) {
                item.score = -Infinity;
            }
        });
    }

    // 3. IMPROVED Forward Progress Requirement: More generous for scenic routes
    if (routeSoFar.length > 0) {
        const currentDistanceToEnd = calculateDistance(currentPosition, end);
        
        scoredWaypoints.forEach(item => {
            if (!item.waypoint.coordinates) {
                item.score = -Infinity;
                return;
            }
            
            const waypointDistanceToEnd = calculateDistance(item.waypoint.coordinates, end);
            
            // Strategy-specific backward movement tolerance
            const strategyTolerance: Record<string, number> = {
                'Twisty': 0.4, // 40% tolerance for twisty routes
                'Valley Route': 0.35,
                'Mountain Route': 0.3,
                'Scenic Loop': 0.6, // Very generous for loops
                'Adventure Route': 0.25,
                'Balanced': 0.25,
                'Direct': 0.1,
                'Historic Route': 0.2
            };
            
            const tolerance = currentDistanceToEnd * (strategyTolerance[strategy] || 0.2);
            
            // If this waypoint is farther from the end than we currently are, it's moving backward
            if (waypointDistanceToEnd > currentDistanceToEnd + tolerance) {
                // Gentler penalty for backward movement within reasonable bounds
                const backwardDistance = waypointDistanceToEnd - (currentDistanceToEnd + tolerance);
                const penaltyFactor = Math.min(backwardDistance / 15000, 0.8); // Max 80% penalty, gentler curve
                item.score *= (1 - penaltyFactor);
                
                if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
                    console.log(`Forward progress penalty for ${item.waypoint.location}: ${backwardDistance.toFixed(0)}m beyond tolerance, penalty: ${(penaltyFactor * 100).toFixed(1)}%`);
                }
            }
            
            // Relaxed check for routes with multiple waypoints
            if (routeSoFar.length >= 2) {
                const startDistanceToEnd = baseDistance;
                const progressMade = startDistanceToEnd - currentDistanceToEnd;
                
                // More generous allowance for backtracking on established routes
                if (progressMade > 0) {
                    const allowedBacktrack = progressMade * 0.7; // Increased from 0.5
                    if (waypointDistanceToEnd > currentDistanceToEnd + allowedBacktrack) {
                        item.score *= 0.3; // Reduced penalty from 0.1 to 0.3
                        
                        if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
                            console.log(`Major backtrack penalty for ${item.waypoint.location}: would undo significant progress`);
                        }
                    }
                }
            }
        });
    }

    // Apply contiguous road bonus AFTER penalties, and only if the road remains good.
    scoredWaypoints.forEach(item => {
        if (lastWaypoint?.location && item.waypoint.location && normalizeLocation(item.waypoint.location) === normalizeLocation(lastWaypoint.location)) {
            // A "good road" is one that's at least reasonably twisty.
            const isGoodContinuation = (lastWaypoint.twistiness || 0) > 0.8;
            if (isGoodContinuation) {
                if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
                    console.log(`Applying strong contiguous bonus for staying on ${item.waypoint.location}`);
                }
                item.score += 25.0; // Strong bonus to encourage staying on a good road
            }
        }
    });

    // Re-sort after all scoring adjustments
    scoredWaypoints.sort((a, b) => b.score - a.score);

    if (scoredWaypoints.length === 0 || scoredWaypoints[0].score <= -Infinity) {
        return null;
    }
    
    // For the first waypoint, return a list of top candidates with improved direction filtering
    if (isFirstWaypoint) {
        // Bearing from start to end provides the general direction of travel
        const overallBearing = geolib.getGreatCircleBearing(currentPosition, end);
        
        const topCandidates = scoredWaypoints.filter(item => {
            if (!item.waypoint.coordinates) return false;
            
            // Bearing from start to the candidate waypoint
            const candidateBearing = geolib.getGreatCircleBearing(currentPosition, item.waypoint.coordinates);
            const angleDiff = Math.abs(overallBearing - candidateBearing);
            const normalizedAngle = Math.min(angleDiff, 360 - angleDiff);
            
            // More generous cone for scenic routes, stricter for direct routes
            const allowedAngle = strategy === 'Direct' ? 45 : 
                               (strategy === 'Scenic Loop' ? 120 : 100);
            
            return normalizedAngle <= allowedAngle;
        });

        // If filtering removes everyone, fall back but with warning
        const finalCandidates = topCandidates.length > 0 ? topCandidates : scoredWaypoints;
        
        if (topCandidates.length === 0 && process.env.NODE_ENV === 'development' && process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
            console.log(`Warning: Direction filtering removed all candidates for ${strategy}, using all waypoints`);
        }

        const bestScore = finalCandidates[0]?.score;
        if (!bestScore) return null;

        // Return all candidates that are within 90% of the top score for more diversity
        return finalCandidates.filter(item => item.score >= bestScore * 0.90);
    }

    return scoredWaypoints[0];
}

export { selectNextWaypoint }; 