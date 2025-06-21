export interface RoadSuitability {
  exclude: boolean;
  penaltyScore: number;
  reasons: string[];
}

/**
 * Determines if a road is suitable for scenic driving by checking for exclusion criteria
 * and applying penalties for undesirable characteristics.
 */
export function getRoadSuitability(tags: any, roadName: string): RoadSuitability {
  const reasons: string[] = [];
  let penaltyScore = 0;
  let exclude = false;

  // --- EXCLUSION RULES ---
  // Rule: Exclude unpaved roads
  if (tags.surface) {
    const surface = tags.surface.toLowerCase();
    if (['unpaved', 'dirt', 'gravel', 'ground', 'sand', 'grass', 'compacted'].includes(surface)) {
      reasons.push(`Exclude: unpaved surface ('${surface}')`);
      exclude = true;
    }
  }

  // Rule: Exclude roads with less than 2 lanes
  if (tags.lanes) {
    const lanes = parseInt(tags.lanes, 10);
    if (!isNaN(lanes) && lanes < 2) {
      reasons.push(`Exclude: less than 2 lanes (${lanes})`);
      exclude = true;
    }
  }

  // Rule: Exclude roads that are too narrow (proxy for < 2 lanes)
  if (tags.width) {
    const width = parseFloat(tags.width);
    if (!isNaN(width) && width < 5.5) { // Assuming a 2-lane road needs at least 5.5m
      reasons.push(`Exclude: road too narrow (${width}m)`);
      exclude = true;
    }
  }

  // Rule: Exclude tracks and service roads that are not meant for general traffic
  if (['track', 'service', 'path', 'driveway'].includes(tags.highway)) {
    reasons.push(`Exclude: unsuitable highway type ('${tags.highway}')`);
    exclude = true;
  }

  // Rule: Exclude roads with prohibitive access or vehicle restrictions
  if (tags.access === 'private' || tags.access === 'no' || tags.motor_vehicle === 'no' || tags.vehicle === 'no' || tags['4wd_only'] === 'yes') {
    reasons.push(`Exclude: restricted access or vehicle type`);
    exclude = true;
  }

  // If road is excluded, return immediately with the reason
  if (exclude) {
    return { exclude: true, penaltyScore: 100, reasons };
  }

  // --- DE-PRIORITIZATION (PENALTIES) for roads that are not excluded ---

  // Penalize roads with "Creek" in the name due to high likelihood of being narrow/unsuitable
  if (roadName.toLowerCase().includes('creek')) {
    reasons.push('High penalty: "Creek" in name');
    penaltyScore += 5.0; // Very aggressive penalty
  }

  // Check for physical width restrictions (as a penalty if not an exclusion)
  if (tags['maxwidth:physical']) {
    const maxWidth = parseFloat(tags['maxwidth:physical']);
    if (!isNaN(maxWidth) && maxWidth < 3.0) {
      reasons.push(`Penalty: tight physical width restriction (${maxWidth}m)`);
      penaltyScore += 2.0;
    }
  }

  // Penalize for poor smoothness
  if (tags.smoothness) {
    const smoothness = tags.smoothness.toLowerCase();
    if (['very_bad', 'horrible', 'very_horrible', 'impassable'].includes(smoothness)) {
      reasons.push(`Penalty: poor smoothness ('${smoothness}')`);
      penaltyScore += 1.5;
    } else if (['bad'].includes(smoothness)) {
      reasons.push(`Penalty: rough surface ('${smoothness}')`);
      penaltyScore += 0.8;
    }
  }

  return {
    exclude: false,
    penaltyScore,
    reasons
  };
} 