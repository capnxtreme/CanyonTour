# Algorithm Improvements for Scenic Route Detection

## Issue Analysis: Lyons Valley Road Case Study

### Problem Statement
Lyons Valley Road, a known excellent twisty road in San Diego County, is not being included in generated routes despite having optimal characteristics for scenic routing.

### Current Road Characteristics (from Overpass API)
- **Name**: Lyons Valley Road  
- **Highway Type**: `secondary`
- **Surface**: `asphalt`
- **Location**: San Diego County, CA (32.73°N, -116.85°W)
- **Geometric Analysis**: 52.71° total angle change over 326m = 1.61 twistiness score
- **Expected Final Score**: ~2.0 (excellent)

### Root Cause Analysis

#### 1. Road Type Bias Against Secondary Roads
**Current Preference Values** (from SCENIC_ROUTING.md):
```javascript
const roadTypePreferences = {
  'primary': 0.2,      // Major highways
  'secondary': 0.4,    // Secondary roads ← UNDERVALUED
  'tertiary': 0.6,     // Local roads
  'unclassified': 0.8, // Rural roads
}
```

**Issue**: Secondary roads are scored lower than tertiary and unclassified roads, but many excellent twisty roads (like Lyons Valley Road) are classified as secondary.

#### 2. Geometric Calculation Issues
The current algorithm may have problems with:
- **Scale factor sensitivity**: `(totalAngle / totalDistance) * 10` may not be optimal
- **Node density effects**: Roads with fewer nodes might appear less twisty
- **Angular change threshold**: Small continuous curves vs sharp turns

#### 3. Progress Score Penalties
```javascript
const progressScore = directRouteDist / totalDist;
twistiness *= progressScore;
```
Roads that create longer routes get penalized, but this might eliminate scenic detours.

## Recommended Improvements

### 1. Revise Road Type Preferences

```javascript
// Improved road type preferences for scenic routes
const improvedRoadTypePreferences = {
  'motorway': 0.1,      // Highways (avoid)
  'trunk': 0.1,         // Major highways (avoid)
  'primary': 0.3,       // Major roads (limited use)
  'secondary': 0.7,     // Secondary roads ← INCREASED
  'tertiary': 0.8,      // Local roads (preferred)
  'unclassified': 0.9,  // Rural roads (most preferred)
  'residential': 0.4,   // Residential streets
  'service': 0.1,       // Service roads (avoid)
  'track': 0.8,         // Dirt/gravel roads (context dependent)
  'path': 0.6          // Scenic paths
};
```

**Rationale**: Many excellent twisty roads are classified as secondary (like Lyons Valley Road, Mulholland Drive, etc.)

### 2. Improved Twistiness Calculation

```javascript
// Enhanced twistiness calculation
function calculateEnhancedTwistiness(coords) {
  if (coords.length < 3) return 0;

  let totalAngle = 0;
  let totalDistance = 0;
  let significantTurns = 0;
  
  // Calculate base metrics
  for (let i = 1; i < coords.length - 1; i++) {
    const angle = Math.abs(calculateAngle(coords[i-1], coords[i], coords[i+1]));
    totalAngle += angle;
    
    // Count significant turns (> 10 degrees)
    if (angle > 10) {
      significantTurns++;
    }
  }

  for (let i = 0; i < coords.length - 1; i++) {
    totalDistance += calculateDistance(coords[i], coords[i+1]);
  }

  if (totalDistance === 0) return 0;

  // Base twistiness score
  const baseTwistiness = (totalAngle / totalDistance) * 1000; // Increased scale factor
  
  // Bonus for significant turns
  const turnDensity = significantTurns / (coords.length - 2);
  const turnBonus = turnDensity * 2;
  
  // Bonus for sustained curves
  const sustainedCurveBonus = totalAngle > 90 ? Math.min(totalAngle / 180, 2) : 0;
  
  return baseTwistiness + turnBonus + sustainedCurveBonus;
}
```

### 3. Enhanced Road Detection Query

```javascript
// More comprehensive Overpass query
const enhancedOverpassQuery = `
[out:json][timeout:25];
(
  // Primary scenic road types
  way["highway"~"^(secondary|tertiary|unclassified|residential)$"]
     ["surface"!~"^(unpaved|dirt|gravel|ground)$"]
     (${minLat},${minLon},${maxLat},${maxLon});
  
  // Named scenic routes (regardless of highway type)
  way["name"~"(Canyon|Valley|Ridge|Mountain|Scenic|Vista|View)"]
     ["highway"~"^(primary|secondary|tertiary|unclassified)$"]
     ["surface"!~"^(unpaved|dirt|gravel|ground)$"]
     (${minLat},${minLon},${maxLat},${maxLon});
  
  // Tourist/scenic tagged roads
  way["scenic"="yes"]
     ["highway"~"^(primary|secondary|tertiary|unclassified)$"]
     (${minLat},${minLon},${maxLat},${maxLon});
);
out body;
>;
out skel qt;`;
```

### 4. Contextual Progress Scoring

```javascript
// Improved progress scoring that doesn't overly penalize scenic detours
function calculateContextualProgressScore(waypoint, start, end, strategy) {
  const distToStart = calculateDistance(waypoint.coordinates, start);
  const distToEnd = calculateDistance(waypoint.coordinates, end);
  const directDistance = calculateDistance(start, end);
  const totalDist = distToStart + distToEnd;
  const detourRatio = totalDist / directDistance;
  
  // Strategy-specific detour tolerance
  const detourTolerance = {
    'Twisty': 1.4,
    'Scenic Loop': 1.6,
    'Mountain Route': 1.3,
    'Valley Route': 1.3,
    'Balanced': 1.2,
    'Direct': 1.1
  };
  
  const maxDetour = detourTolerance[strategy] || 1.2;
  
  if (detourRatio > maxDetour) {
    return 0; // Exclude waypoint
  }
  
  // Gentler penalty for reasonable detours
  const progressScore = Math.max(0.3, 1 - ((detourRatio - 1) * 0.5));
  return progressScore;
}
```

### 5. Multi-Factor Scoring System

```javascript
// Comprehensive waypoint scoring
function calculateWaypointScore(waypoint, context) {
  const {element, startCoords, endCoords, strategy} = context;
  
  // Base geometric score
  let geometricScore = 0;
  if (element.type === 'way' && element.nodes) {
    geometricScore = calculateEnhancedTwistiness(element.nodes);
  }
  
  // Road type score
  const roadTypeScore = improvedRoadTypePreferences[element.tags?.highway] || 0.5;
  
  // Named road bonus
  const namedRoadBonus = element.tags?.name ? 0.5 : 0;
  
  // Scenic tags bonus
  const scenicBonus = element.tags?.scenic === 'yes' ? 1.0 : 0;
  
  // Location context bonus (Canyon, Valley, etc. in name)
  const locationBonus = element.tags?.name && 
    /canyon|valley|ridge|mountain|scenic|vista|view/i.test(element.tags.name) ? 0.8 : 0;
  
  // Progress score
  const progressScore = calculateContextualProgressScore(waypoint, startCoords, endCoords, strategy);
  
  if (progressScore === 0) return -Infinity; // Exclude
  
  // Combine scores
  const totalScore = (geometricScore + roadTypeScore + namedRoadBonus + scenicBonus + locationBonus) * progressScore;
  
  return {
    total: totalScore,
    breakdown: {
      geometric: geometricScore,
      roadType: roadTypeScore,
      named: namedRoadBonus,
      scenic: scenicBonus,
      location: locationBonus,
      progress: progressScore
    }
  };
}
```

## Implementation Priority

### Phase 1: Quick Fixes (High Impact, Low Effort)
1. **Increase secondary road preference** from 0.4 to 0.7
2. **Reduce minimum twistiness threshold** from 0.1 to 0.05
3. **Add logging** to see which roads are being filtered out and why

### Phase 2: Enhanced Algorithm (Medium Effort)
1. Implement enhanced twistiness calculation
2. Add contextual progress scoring
3. Update Overpass query to include named scenic routes

### Phase 3: Advanced Features (High Effort)
1. Multi-factor scoring system
2. Machine learning integration for user preferences
3. Real-time traffic and road condition integration

## Testing Strategy

### Verification Test Cases
1. **Lyons Valley Road**: Should score >1.5 and be included
2. **Mulholland Drive**: Another known scenic secondary road
3. **Pacific Coast Highway**: Primary road that should still be included
4. **Small residential streets**: Should be filtered out

### Metrics to Track
- Total waypoints found per query
- Distribution of road types in results
- User selection patterns for different road types
- Route quality feedback

## Expected Results

With these improvements, Lyons Valley Road should:
- Score ~2.5-3.0 (vs current ~2.0)
- Consistently appear in "Twisty" and "Balanced" route options
- Be preferred over less interesting tertiary roads

The algorithm will better recognize that many excellent driving roads are classified as "secondary" in OpenStreetMap data. 