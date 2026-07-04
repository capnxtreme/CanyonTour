import { calculateDistance } from './geoUtils';

export interface RouteAnalysis {
    hasOutAndBack: boolean;
    backtrackDistance: number;
    backtrackPercentage: number;
    continuousSegments: number;
    analysis: string;
}

export interface RouteCoordinate {
    lat: number;
    lng: number;
}

/**
 * Analyzes a Google Maps DirectionsResult to detect out-and-back patterns
 * by examining the actual route path and identifying backtracking
 */
export function analyzeRouteForOutAndBack(directionsResult: google.maps.DirectionsResult): RouteAnalysis {
    if (!directionsResult?.routes?.[0]?.overview_path) {
        return {
            hasOutAndBack: false,
            backtrackDistance: 0,
            backtrackPercentage: 0,
            continuousSegments: 0,
            analysis: "No route data available"
        };
    }

    const path = directionsResult.routes[0].overview_path;
    if (path.length < 10) {
        return {
            hasOutAndBack: false,
            backtrackDistance: 0,
            backtrackPercentage: 0,
            continuousSegments: 1,
            analysis: "Route too short to analyze"
        };
    }

    // Convert Google Maps LatLng to our coordinate format
    const coords = path.map(point => ({
        lat: point.lat(),
        lng: point.lng()
    }));

    // Calculate total route distance
    let totalDistance = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        totalDistance += calculateDistance(
            { lat: coords[i].lat, lon: coords[i].lng },
            { lat: coords[i + 1].lat, lon: coords[i + 1].lng }
        );
    }

    // Detect backtracking by looking for segments that return to previously visited areas
    let backtrackDistance = 0;
    const visitedAreas: RouteCoordinate[] = [];
    const PROXIMITY_THRESHOLD = 500; // 500m - areas closer than this are considered "revisited"
    const SEGMENT_SIZE = Math.max(Math.floor(coords.length / 20), 3); // Analyze route in segments

    for (let i = 0; i < coords.length; i += SEGMENT_SIZE) {
        const currentSegment = coords.slice(i, i + SEGMENT_SIZE);
        const segmentCenter = getSegmentCenter(currentSegment);
        
        // Check if this segment revisits a previously visited area
        const nearbyVisited = visitedAreas.find(visited => 
            calculateDistance(
                { lat: segmentCenter.lat, lon: segmentCenter.lng },
                { lat: visited.lat, lon: visited.lng }
            ) < PROXIMITY_THRESHOLD
        );

        if (nearbyVisited && visitedAreas.length > 2) {
            // Calculate distance of this backtrack segment
            let segmentDistance = 0;
            for (let j = 0; j < currentSegment.length - 1; j++) {
                segmentDistance += calculateDistance(
                    { lat: currentSegment[j].lat, lon: currentSegment[j].lng },
                    { lat: currentSegment[j + 1].lat, lon: currentSegment[j + 1].lng }
                );
            }
            backtrackDistance += segmentDistance;
        } else {
            visitedAreas.push(segmentCenter);
        }
    }

    const backtrackPercentage = (backtrackDistance / totalDistance) * 100;
    const hasOutAndBack = backtrackPercentage > 15; // More than 15% backtracking is problematic

    // Count continuous segments (segments that don't backtrack)
    const continuousSegments = Math.max(visitedAreas.length - Math.floor(backtrackDistance / 2000), 1);

    let analysis: string;
    if (hasOutAndBack) {
        analysis = `Route contains ${backtrackPercentage.toFixed(1)}% backtracking (${(backtrackDistance/1000).toFixed(1)}km of ${(totalDistance/1000).toFixed(1)}km total)`;
    } else {
        analysis = `Route is continuous with minimal backtracking (${backtrackPercentage.toFixed(1)}%)`;
    }

    return {
        hasOutAndBack,
        backtrackDistance,
        backtrackPercentage,
        continuousSegments,
        analysis
    };
}

/**
 * Calculates the geographic center of a route segment
 */
function getSegmentCenter(segment: RouteCoordinate[]): RouteCoordinate {
    if (segment.length === 0) {
        return { lat: 0, lng: 0 };
    }
    
    const sumLat = segment.reduce((sum, coord) => sum + coord.lat, 0);
    const sumLng = segment.reduce((sum, coord) => sum + coord.lng, 0);
    
    return {
        lat: sumLat / segment.length,
        lng: sumLng / segment.length
    };
}

/**
 * Analyzes route complexity and continuity
 */
export function calculateRouteContinuity(directionsResult: google.maps.DirectionsResult): number {
    const analysis = analyzeRouteForOutAndBack(directionsResult);
    
    // Score from 0-1 where 1 is perfectly continuous
    const backtrackPenalty = Math.min(analysis.backtrackPercentage / 100, 0.8); // Max 80% penalty
    const continuityScore = Math.max(1 - backtrackPenalty, 0.1); // Min 10% score
    
    return continuityScore;
}