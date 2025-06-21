import { SuggestedWaypoint, Coordinates } from '../../types';
import { calculateDistance } from './geoUtils';

export interface LinkedRoad {
    name: string;
    segments: SuggestedWaypoint[];
    totalLength: number;
    averageTwistiness: number;
    totalTwistiness: number;
    roadType: string;
    startPoint: Coordinates;
    endPoint: Coordinates;
    continuousScore: number;
}

/**
 * Links OSM road segments into complete roads for better scenic route selection
 * This solves the problem where long roads like Lyons Valley Road are split into
 * multiple segments but we want to select the entire road as a continuous route.
 */
export function linkRoadSegments(waypoints: SuggestedWaypoint[]): LinkedRoad[] {
    // Group waypoints by normalized road name
    const roadGroups = new Map<string, SuggestedWaypoint[]>();
    
    waypoints.forEach(wp => {
        const normalizedName = normalizeRoadName(wp.location || '');
        if (normalizedName.length > 0) {
            if (!roadGroups.has(normalizedName)) {
                roadGroups.set(normalizedName, []);
            }
            roadGroups.get(normalizedName)!.push(wp);
        }
    });

    const linkedRoads: LinkedRoad[] = [];

    roadGroups.forEach((segments, roadName) => {
        // Only link roads with multiple segments (2+)
        if (segments.length < 2) {
            return;
        }

        // Sort segments geographically to create a continuous path
        const sortedSegments = sortSegmentsGeographically(segments);
        
        // Calculate road statistics
        const totalTwistiness = sortedSegments.reduce((sum, seg) => sum + (seg.twistiness || 0), 0);
        const averageTwistiness = totalTwistiness / sortedSegments.length;
        
        // Estimate total road length
        const totalLength = estimateRoadLength(sortedSegments);
        
        // Calculate continuity score based on segment gaps
        const continuousScore = calculateContinuityScore(sortedSegments);
        
        // Get most common road type
        const roadType = getMostCommonRoadType(sortedSegments);
        
        const linkedRoad: LinkedRoad = {
            name: roadName,
            segments: sortedSegments,
            totalLength,
            averageTwistiness,
            totalTwistiness,
            roadType,
            startPoint: sortedSegments[0].coordinates!,
            endPoint: sortedSegments[sortedSegments.length - 1].coordinates!,
            continuousScore
        };

        linkedRoads.push(linkedRoad);
    });

    // Sort by total twistiness and road quality
    linkedRoads.sort((a, b) => {
        // Prioritize valley roads and secondary roads
        const aIsValley = a.name.toLowerCase().includes('valley');
        const bIsValley = b.name.toLowerCase().includes('valley');
        const aIsSecondary = a.roadType === 'secondary';
        const bIsSecondary = b.roadType === 'secondary';
        
        // Valley roads get priority
        if (aIsValley && !bIsValley) return -1;
        if (!aIsValley && bIsValley) return 1;
        
        // Secondary roads get priority
        if (aIsSecondary && !bIsSecondary) return -1;
        if (!aIsSecondary && bIsSecondary) return 1;
        
        // Then sort by total twistiness * continuity
        const aScore = a.totalTwistiness * a.continuousScore;
        const bScore = b.totalTwistiness * b.continuousScore;
        return bScore - aScore;
    });

    return linkedRoads;
}

/**
 * Creates strategic waypoints from the best segments of linked roads
 * This ensures long scenic roads like Lyons Valley Road are properly represented
 */
export function createStrategicWaypointsFromLinkedRoads(
    linkedRoads: LinkedRoad[],
    maxWaypoints: number = 10
): SuggestedWaypoint[] {
    const strategicWaypoints: SuggestedWaypoint[] = [];
    
    // Process the top linked roads
    const topRoads = linkedRoads.slice(0, 5); // Top 5 roads
    
    topRoads.forEach((road, roadIndex) => {
        if (strategicWaypoints.length >= maxWaypoints) return;
        
        // For roads with many segments, select strategic points along the route
        const segmentCount = road.segments.length;
        let waypointsToSelect = 1;
        
        if (segmentCount >= 8) {
            waypointsToSelect = 3; // Start, middle, end for long roads
        } else if (segmentCount >= 4) {
            waypointsToSelect = 2; // Start and end for medium roads
        } else {
            waypointsToSelect = 1; // Just the best segment for short roads
        }
        
        // Select the best segments from this road
        const sortedByTwistiness = [...road.segments].sort((a, b) => (b.twistiness || 0) - (a.twistiness || 0));
        
        if (waypointsToSelect === 1) {
            // Just take the twistiest segment
            const bestSegment = sortedByTwistiness[0];
            strategicWaypoints.push(enhanceWaypointForLinkedRoad(bestSegment, road, 'best'));
        } else if (waypointsToSelect === 2) {
            // Take segments from start and end of the road
            const startSegment = road.segments[0];
            const endSegment = road.segments[road.segments.length - 1];
            
            strategicWaypoints.push(enhanceWaypointForLinkedRoad(startSegment, road, 'start'));
            strategicWaypoints.push(enhanceWaypointForLinkedRoad(endSegment, road, 'end'));
        } else {
            // Take start, best middle, and end
            const startSegment = road.segments[0];
            const endSegment = road.segments[road.segments.length - 1];
            const middleIndex = Math.floor(road.segments.length / 2);
            const middleSegment = road.segments[middleIndex];
            
            strategicWaypoints.push(enhanceWaypointForLinkedRoad(startSegment, road, 'start'));
            strategicWaypoints.push(enhanceWaypointForLinkedRoad(middleSegment, road, 'middle'));
            strategicWaypoints.push(enhanceWaypointForLinkedRoad(endSegment, road, 'end'));
        }
    });
    
    return strategicWaypoints;
}

function normalizeRoadName(name: string): string {
    if (!name) return '';
    
    // Clean up road name for grouping
    return name.toLowerCase()
        .replace(/\s+(rd|road|ln|lane|dr|drive|st|street|ave|avenue|blvd|boulevard|ct|court|pl|place|pkwy|parkway|ter|terrace|trl|trail)\s*$/i, '')
        .replace(/[^\w\s]/g, '') // Remove special characters
        .trim();
}

function sortSegmentsGeographically(segments: SuggestedWaypoint[]): SuggestedWaypoint[] {
    if (segments.length <= 2) return segments;
    
    // Simple geographic sorting - start from westernmost point and follow path
    const sorted = [...segments];
    sorted.sort((a, b) => {
        if (!a.coordinates || !b.coordinates) return 0;
        
        // Primary sort by longitude (west to east)
        const lonDiff = a.coordinates.lon - b.coordinates.lon;
        if (Math.abs(lonDiff) > 0.01) return lonDiff;
        
        // Secondary sort by latitude for roads running north-south
        return a.coordinates.lat - b.coordinates.lat;
    });
    
    return sorted;
}

function estimateRoadLength(segments: SuggestedWaypoint[]): number {
    if (segments.length < 2) return 0;
    
    let totalLength = 0;
    for (let i = 0; i < segments.length - 1; i++) {
        const seg1 = segments[i];
        const seg2 = segments[i + 1];
        if (seg1.coordinates && seg2.coordinates) {
            totalLength += calculateDistance(seg1.coordinates, seg2.coordinates);
        }
    }
    
    return totalLength;
}

function calculateContinuityScore(segments: SuggestedWaypoint[]): number {
    if (segments.length < 2) return 1.0;
    
    const maxGap = 2000; // 2km - segments farther apart than this hurt continuity
    let continuityScore = 1.0;
    
    for (let i = 0; i < segments.length - 1; i++) {
        const seg1 = segments[i];
        const seg2 = segments[i + 1];
        if (seg1.coordinates && seg2.coordinates) {
            const gap = calculateDistance(seg1.coordinates, seg2.coordinates);
            if (gap > maxGap) {
                const penalty = Math.min((gap - maxGap) / maxGap, 0.5); // Max 50% penalty
                continuityScore -= penalty / segments.length;
            }
        }
    }
    
    return Math.max(continuityScore, 0.1); // Minimum 10% score
}

function getMostCommonRoadType(segments: SuggestedWaypoint[]): string {
    const typeCounts = new Map<string, number>();
    
    segments.forEach(seg => {
        const type = seg.roadType || 'unknown';
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    });
    
    let mostCommon = 'unknown';
    let maxCount = 0;
    typeCounts.forEach((count, type) => {
        if (count > maxCount) {
            maxCount = count;
            mostCommon = type;
        }
    });
    
    return mostCommon;
}

function enhanceWaypointForLinkedRoad(
    waypoint: SuggestedWaypoint, 
    road: LinkedRoad, 
    position: 'start' | 'middle' | 'end' | 'best'
): SuggestedWaypoint {
    // Create enhanced waypoint with road context
    const enhanced: SuggestedWaypoint = {
        ...waypoint,
        id: `linked-${road.name}-${position}`,
        description: `${road.name} (${position} of ${road.segments.length} segments, ${(road.totalLength/1000).toFixed(1)}km)`,
        strategicValue: road.averageTwistiness * road.continuousScore,
        routingPurpose: 'twisty_routing',
        // Boost twistiness for segments that are part of a high-quality continuous road
        twistiness: (waypoint.twistiness || 0) * (1 + road.continuousScore * 0.5)
    };
    
    return enhanced;
}