import { calculateDistance } from '../../utils/routing/geoUtils';

export interface TwistinessResult {
  twistiness: number;
  debugInfo?: {
    totalAngle: number;
    totalDistance: number;
    numTurns: number;
    avgAngle: number;
    turnsPerKm: number;
  };
}

export class TwistinessCalculator {
  calculateAngle(p1: any, p2: any, p3: any): number {
    const angle1 = Math.atan2(p2.lat - p1.lat, p2.lon - p1.lon);
    const angle2 = Math.atan2(p3.lat - p2.lat, p3.lon - p2.lon);
    let angle = (angle2 - angle1) * (180 / Math.PI);
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;
    return angle;
  }

  calculateWayTwistiness(nodeIds: number[], nodeMap: Map<number, any>): TwistinessResult {
    const coords = nodeIds.map(id => nodeMap.get(id)).filter(Boolean);
    if (coords.length < 3) return { twistiness: 0 };

    let totalAngle = 0;
    let totalDistance = 0;
    const angles: number[] = [];

    for (let i = 1; i < coords.length - 1; i++) {
      const angle = Math.abs(this.calculateAngle(coords[i - 1], coords[i], coords[i + 1]));
      if (angle > 8) { // Increase threshold slightly to focus on more significant turns
        angles.push(angle);
        totalAngle += angle;
      }
    }

    for (let i = 0; i < coords.length - 1; i++) {
      totalDistance += calculateDistance(coords[i], coords[i + 1]);
    }

    // Convert total distance to kilometres for more intuitive scaling
    const totalDistanceKm = totalDistance / 1000.0;

    const numTurns = angles.length;
    if (totalDistanceKm === 0 || numTurns < 1) {
      return { twistiness: 0 };
    }

    // Hybrid approach: Reward both curvature and turn density
    const avgAngle = totalAngle / numTurns; // average absolute turn angle in degrees
    const turnsPerKm = numTurns / totalDistanceKm;

    // Base scores
    const angleScore = Math.min(avgAngle / 45.0, 1.0); // 0-1 based on curvature sharpness
    const densityScore = Math.min(turnsPerKm / 3.0, 1.0); // 0-1 based on turn frequency (>=3 turns/km saturates)

    // Length factor – penalise only extremely short segments, reward longer scenic stretches
    let lengthFactor = 1.0;
    if (totalDistanceKm < 0.3) { // <300 m – very tiny
      lengthFactor = 0.4;
    } else if (totalDistanceKm < 0.8) { // <800 m
      lengthFactor = 0.7;
    } else if (totalDistanceKm > 4.0 && totalDistanceKm <= 12.0) { // 4-12 km – ideal sustained road
      lengthFactor = 1.4;
    } else if (totalDistanceKm > 12.0) { // really long scenic stretch
      lengthFactor = 1.7;
    }

    // Node density factor – only penalise if geometry is extremely sparse
    let nodeCountFactor = 1.0;
    const nodeCount = coords.length;
    if (nodeCount < 4) {
      nodeCountFactor = 0.4; // cannot gauge curvature reliably
    } else if (nodeCount < 8) {
      nodeCountFactor = 0.7;
    } else if (nodeCount > 40) {
      nodeCountFactor = 1.2; // detailed geometry gets a boost
    }

    // Combine
    const baseScore = (angleScore * 0.6) + (densityScore * 0.4);
    const twistiness = baseScore * lengthFactor * nodeCountFactor * 4.0; // amplified scale

    return {
      twistiness: Math.min(twistiness, 8.0), // cap to keep within reasonable bounds
      debugInfo: {
        totalAngle,
        totalDistance,
        numTurns,
        avgAngle,
        turnsPerKm
      }
    };
  }
}

export const twistinessCalculator = new TwistinessCalculator(); 