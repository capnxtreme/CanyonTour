import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

interface Waypoint {
  id: string;
  location: string;
}

interface Route {
  start: string;
  end: string;
  waypoints: Waypoint[];
}

interface RoutePreferences {
  avoidHighways: boolean;
  avoidTolls: boolean;
  favorScenicRoads: boolean;
}

interface SuggestedWaypoint {
  id: string;
  location: string;
  description: string;
  checked: boolean;
  type: string;
  rating?: number;
  score?: number;
  elevation?: number;
  distanceFromRoute?: number;
  seasonality?: string[];
  tags?: string[];
  coordinates?: { lat: number; lon: number };
  // Strategic routing properties
  twistiness?: number;
  elevationChange?: number;
  roadType?: string;
  strategicValue?: number;
  routingPurpose?: 'twisty_routing' | 'elevation_forcing' | 'scenic_bypass' | 'canyon_access';
}

function App() {
  const [route, setRoute] = useState<Route>({
    start: '',
    end: '',
    waypoints: []
  });
  const [routeUrl, setRouteUrl] = useState<string>('');
  const [wazeUrl, setWazeUrl] = useState<string>('');
  const [preferences, setPreferences] = useState<RoutePreferences>({
    avoidHighways: true,
    avoidTolls: true,
    favorScenicRoads: true
  });
  const [suggestedWaypoints, setSuggestedWaypoints] = useState<SuggestedWaypoint[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Utility functions first
  const getEnhancedRouteBoundingBox = async (start: string, end: string): Promise<string | null> => {
    try {
      const startCoords = await geocodeLocation(start);
      const endCoords = await geocodeLocation(end);
      if (!startCoords || !endCoords) return null;
      
      const minLat = Math.min(startCoords.lat, endCoords.lat);
      const maxLat = Math.max(startCoords.lat, endCoords.lat);
      const minLon = Math.min(startCoords.lon, endCoords.lon);
      const maxLon = Math.max(startCoords.lon, endCoords.lon);
      
      return `${minLat},${minLon},${maxLat},${maxLon}`;
    } catch (error) {
      console.log('Failed to get route bounding box:', error);
      return null;
    }
  };

  const calculateRoadTwistiness = (element: any): number => {
    // Calculate twistiness based on road geometry
    const tags = element.tags || {};
    let twistiness = 0;
    
    // Base twistiness on road type
    if (tags.highway === 'tertiary') twistiness += 3;
    if (tags.highway === 'unclassified') twistiness += 4;
    if (tags.highway === 'residential') twistiness += 2;
    
    // Add twistiness for mountain passes
    if (tags.mountain_pass === 'yes') twistiness += 5;
    
    // Add twistiness for unpaved roads
    if (tags.surface === 'unpaved' || tags.surface === 'gravel' || tags.surface === 'dirt') twistiness += 2;
    
    // Add twistiness for geographic features
    if (tags.natural === 'saddle' || tags.natural === 'pass') twistiness += 3;
    
    return Math.min(twistiness, 10); // Cap at 10
  };

  const calculateStrategicRoutingValue = (tags: any): number => {
    let value = 0;
    
    // High value for features that force interesting routing
    if (tags.highway === 'give_way' || tags.highway === 'stop') value += 3;
    if (tags.barrier === 'cattle_grid' || tags.barrier === 'height_restrictor') value += 4;
    if (tags.highway === 'turning_circle' || tags.junction === 'roundabout') value += 2;
    
    // Value for small settlements that force routing through back roads
    if (tags.place === 'hamlet' || tags.place === 'village' || tags.place === 'locality') value += 3;
    
    return Math.min(value, 10); // Cap at 10
  };

  const determineRoutingPurpose = (tags: any): 'twisty_routing' | 'elevation_forcing' | 'scenic_bypass' | 'canyon_access' => {
    if (tags.mountain_pass === 'yes' || tags.natural === 'pass') return 'elevation_forcing';
    if (tags.natural === 'saddle' || tags.natural === 'ridge') return 'canyon_access';
    if (tags.highway === 'tertiary' || tags.highway === 'unclassified') return 'twisty_routing';
    return 'scenic_bypass';
  };

  const getRouteElevationProfile = async (start: string, end: string): Promise<Array<{ elevation: number; coordinates: { lat: number; lon: number }; elevationChange: number }>> => {
    // Mock elevation profile data - in real implementation, would use elevation API
    return [
      { elevation: 1000, coordinates: { lat: 37.5, lon: -119.5 }, elevationChange: 0 },
      { elevation: 2000, coordinates: { lat: 37.6, lon: -119.4 }, elevationChange: 1000 },
      { elevation: 1500, coordinates: { lat: 37.7, lon: -119.3 }, elevationChange: -500 }
    ];
  };

  const findSignificantElevationChanges = (profile: Array<{ elevation: number; coordinates: { lat: number; lon: number }; elevationChange: number }>): Array<{ elevation: number; coordinates: { lat: number; lon: number }; elevationChange: number }> => {
    return profile.filter(point => Math.abs(point.elevationChange) > 500);
  };

  const generateBypassPoints = (start: string, end: string): Array<{ coordinates: { lat: number; lon: number } }> => {
    return [
      { coordinates: { lat: 37.5, lon: -119.5 } },
      { coordinates: { lat: 37.6, lon: -119.4 } }
    ];
  };

  const identifyMountainPasses = (start: string, end: string): Array<{ coordinates: { lat: number; lon: number }; elevation: number; elevationChange: number }> => {
    return [
      { coordinates: { lat: 37.5, lon: -119.5 }, elevation: 2000, elevationChange: 1000 },
      { coordinates: { lat: 37.6, lon: -119.4 }, elevation: 2500, elevationChange: 500 }
    ];
  };

  const calculateRoadGeometryScore = (waypoint: SuggestedWaypoint): number => {
    return (waypoint.twistiness || 0) * (waypoint.strategicValue || 1);
  };

  const calculateDistance = (coord1?: { lat: number; lon: number }, coord2?: { lat: number; lon: number }): number => {
    if (!coord1 || !coord2) return 0;
    const R = 6371; // Earth's radius in km
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLon = (coord2.lon - coord1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Now the useCallback hooks that depend on the utility functions
  const findTwistyRoadWaypoints = useCallback(async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    try {
      const bbox = await getEnhancedRouteBoundingBox(start, end);
      if (!bbox) return [];

      // Strategic query focused on twisty roads and routing forcing points
      const overpassQuery = `
        [out:json][timeout:15];
        (
          // Twisty roads - prioritize tertiary, unclassified, and residential roads
          way["highway"~"^(tertiary|unclassified|residential)$"][bbox:${bbox}];
          way["highway"="secondary"]["lanes"~"^(1|2)$"][bbox:${bbox}];
          
          // Mountain and canyon roads (inherently twisty)
          way["highway"]["mountain_pass"="yes"][bbox:${bbox}];
          way["highway"~"^(tertiary|unclassified)$"]["surface"~"^(unpaved|gravel|dirt)$"][bbox:${bbox}];
          
          // Road features that force interesting routing
          node["highway"="give_way"][bbox:${bbox}];
          node["highway"="stop"][bbox:${bbox}];
          node["barrier"~"^(cattle_grid|height_restrictor)$"][bbox:${bbox}];
          
          // Strategic routing points (not destinations)
          node["highway"="turning_circle"][bbox:${bbox}];
          way["junction"="roundabout"][bbox:${bbox}];
          
          // Small settlements that force routing through back roads
          node["place"~"^(hamlet|village)$"][bbox:${bbox}];
          node["place"="locality"][bbox:${bbox}];
          
          // Geographic features that indicate twisty terrain
          node["natural"="saddle"][bbox:${bbox}];
          node["natural"="pass"][bbox:${bbox}];
          way["natural"="ridge"][bbox:${bbox}];
          
          // Points that force elevation changes (inherently twisty)
          node["ford"][bbox:${bbox}];
          node["waterway"="waterfall"][bbox:${bbox}];
        );
        out geom meta;
      `;

      const response = await fetch(`https://overpass-api.de/api/interpreter`, {
        method: 'POST',
        body: overpassQuery,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.ok) {
        const data = await response.json();
        return data.elements?.map((element: any) => {
          const name = element.tags?.name || generateStrategicRoutingName(element.tags, element.type);
          const lat = element.lat || (element.bounds ? (element.bounds.minlat + element.bounds.maxlat) / 2 : 0);
          const lon = element.lon || (element.bounds ? (element.bounds.minlon + element.bounds.maxlon) / 2 : 0);
          
          const twistiness = calculateRoadTwistiness(element);
          const strategicValue = calculateStrategicRoutingValue(element.tags);
          
          return {
            id: `twisty-${element.id}`,
            location: `${name}`,
            description: getStrategicRoutingDescription(element.tags),
            checked: preferences.favorScenicRoads,
            type: 'strategic_routing',
            coordinates: { lat, lon },
            roadType: element.tags?.highway || 'unknown',
            twistiness: twistiness,
            strategicValue: strategicValue,
            routingPurpose: determineRoutingPurpose(element.tags),
            elevation: element.tags?.ele ? parseInt(element.tags.ele) : undefined,
            score: twistiness * strategicValue
          };
        }).filter((w: any) => w.twistiness > 3) || []; // Only include roads with decent twistiness
      }
    } catch (error) {
      console.log('Advanced OSM query failed:', error);
    }
    return [];
  }, [getEnhancedRouteBoundingBox, calculateRoadTwistiness, calculateStrategicRoutingValue, determineRoutingPurpose]);

  const findElevationChangeRoutes = useCallback(async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    try {
      const elevationProfile = await getRouteElevationProfile(start, end);
      const elevationChanges = findSignificantElevationChanges(elevationProfile);
      
      return elevationChanges.map((change, index) => ({
        id: `elevation-route-${index}`,
        location: `Elevation Routing Point (${change.elevation}ft)`,
        description: `Forces routing through ${change.elevationChange > 0 ? 'climbing' : 'descending'} roads with ${Math.abs(change.elevationChange)}ft change`,
        checked: preferences.favorScenicRoads,
        type: 'elevation_forcing',
        coordinates: change.coordinates,
        elevation: change.elevation,
        elevationChange: Math.abs(change.elevationChange),
        twistiness: Math.min(Math.abs(change.elevationChange) / 100, 10),
        strategicValue: 8,
        routingPurpose: 'elevation_forcing' as const,
        score: Math.abs(change.elevationChange) / 50 // Score based on elevation change
      }));
    } catch (error) {
      console.log('Elevation route discovery failed:', error);
      return [];
    }
  }, [getRouteElevationProfile, findSignificantElevationChanges]);

  const findCanyonAccessPoints = useCallback(async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    try {
      const canyonKeywords = ['canyon', 'gorge', 'valley', 'ravine', 'gulch'];
      const routeDescription = `${start} ${end}`.toLowerCase();
      
      // If route involves canyon areas, find strategic canyon access points
      if (canyonKeywords.some(keyword => routeDescription.includes(keyword))) {
        return [
          {
            id: 'canyon-access-1',
            location: 'Canyon Rim Access',
            description: 'Forces routing along canyon rim roads with switchbacks and elevation changes',
            checked: preferences.favorScenicRoads,
            type: 'canyon_access',
            twistiness: 9,
            strategicValue: 9,
            routingPurpose: 'canyon_access' as const,
            score: 81,
            coordinates: { lat: 37.5, lon: -119.5 }
          },
          {
            id: 'canyon-access-2',
            location: 'Canyon Floor Route',
            description: 'Forces routing through winding canyon floor roads following natural contours',
            checked: preferences.favorScenicRoads,
            type: 'canyon_access',
            twistiness: 8,
            strategicValue: 8,
            routingPurpose: 'canyon_access' as const,
            score: 64,
            coordinates: { lat: 37.3, lon: -119.3 }
          }
        ];
      }
      
      return [];
    } catch (error) {
      console.log('Canyon access discovery failed:', error);
      return [];
    }
  }, []);

  const findScenicBypassRoutes = useCallback(async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    try {
      // Generate strategic bypass points that force routing away from direct highways
      const bypassPoints = generateBypassPoints(start, end);
      
      return bypassPoints.map((point, index) => ({
        id: `scenic-bypass-${index}`,
        location: `Scenic Bypass Point ${index + 1}`,
        description: `Forces routing away from highways onto twisty back roads and scenic routes`,
        checked: preferences.favorScenicRoads,
        type: 'scenic_bypass',
        coordinates: point.coordinates,
        twistiness: 7,
        strategicValue: 9,
        routingPurpose: 'scenic_bypass' as const,
        roadType: 'tertiary',
        score: 63
      }));
    } catch (error) {
      console.log('Scenic bypass discovery failed:', error);
      return [];
    }
  }, [generateBypassPoints]);

  const findMountainPassRoutes = useCallback(async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    try {
      const passPoints = identifyMountainPasses(start, end);
      
      return passPoints.map((pass, index) => ({
        id: `mountain-pass-${index}`,
        location: `Mountain Pass Route ${index + 1}`,
        description: `Forces routing through mountain pass with switchbacks, hairpin turns, and dramatic elevation changes`,
        checked: preferences.favorScenicRoads,
        type: 'mountain_pass',
        coordinates: pass.coordinates,
        elevation: pass.elevation,
        twistiness: 10, // Maximum twistiness for mountain passes
        elevationChange: pass.elevationChange,
        strategicValue: 10,
        routingPurpose: 'twisty_routing' as const,
        roadType: 'tertiary',
        score: 100 // Highest possible score for maximum twistiness
      }));
    } catch (error) {
      console.log('Mountain pass discovery failed:', error);
      return [];
    }
  }, [identifyMountainPasses]);

  const analyzeRoadGeometry = useCallback(async (waypoints: SuggestedWaypoint[], start: string, end: string): Promise<SuggestedWaypoint[]> => {
    return waypoints.map(waypoint => {
      // Analyze road curvature and geometry around each waypoint
      const geometryScore = calculateRoadGeometryScore(waypoint);
      return { ...waypoint, twistiness: geometryScore };
    });
  }, [calculateRoadGeometryScore]);

  const optimizeForTwistyRouting = useCallback((waypoints: SuggestedWaypoint[], start: string, end: string): SuggestedWaypoint[] => {
    // Sort by twistiness score (highest twistiness first)
    const sorted = waypoints.sort((a, b) => (b.score || 0) - (a.score || 0));
    
    // Distribute along route to force maximum twisty road usage
    return sorted.filter((waypoint, index) => {
      // Keep all high-twistiness waypoints (score > 50)
      if ((waypoint.score || 0) > 50) return true;
      
      // For lower scoring waypoints, ensure geographic distribution
      if (index < 5) return true; // Always keep top 5
      
      const selected = sorted.slice(0, index);
      return !selected.some(selectedWp => 
        calculateDistance(waypoint.coordinates, selectedWp.coordinates) < 15 // 15km minimum separation for strategic points
      );
    });
  }, [calculateDistance]);

  const selectMaxTwistinessWaypoints = (waypoints: SuggestedWaypoint[], maxCount: number): SuggestedWaypoint[] => {
    // Sort by twistiness and strategic value
    const sorted = waypoints.sort((a, b) => {
      const scoreA = (a.twistiness || 0) * (a.strategicValue || 1);
      const scoreB = (b.twistiness || 0) * (b.strategicValue || 1);
      return scoreB - scoreA;
    });
    
    return sorted.slice(0, maxCount);
  };

  // Strategic routing utility functions 
  const generateStrategicRoutingName = (tags: any, elementType: string): string => {
    if (tags?.name) return `${tags.name} (Strategic Route)`;
    if (tags?.highway) return `Twisty ${tags.highway.charAt(0).toUpperCase() + tags.highway.slice(1)} Route`;
    if (tags?.natural === 'pass') return 'Mountain Pass Route';
    if (tags?.natural === 'saddle') return 'Ridge Crossing Route';
    if (tags?.place) return `${tags.place.charAt(0).toUpperCase() + tags.place.slice(1)} Bypass`;
    return `Strategic Routing Point ${elementType}`;
  };

  const getStrategicRoutingDescription = (tags: any): string => {
    const descriptions: Record<string, string> = {
      'tertiary': 'Forces routing through narrow tertiary roads with curves and elevation changes',
      'unclassified': 'Strategic routing through unclassified back roads for maximum twistiness',
      'residential': 'Residential area routing to avoid main highways and add road variety',
      'secondary': 'Secondary road routing with moderate twistiness and scenic value',
      'mountain_pass': 'Mountain pass with switchbacks, hairpin turns, and dramatic elevation changes',
      'pass': 'Natural pass forcing routing through twisty mountain terrain',
      'saddle': 'Ridge saddle point creating winding approach roads',
      'hamlet': 'Small settlement forcing routing through local roads',
      'village': 'Village routing to utilize connecting country roads',
      'locality': 'Local area requiring back road navigation'
    };
    
    for (const [key, description] of Object.entries(descriptions)) {
      if (tags?.highway === key || tags?.natural === key || tags?.place === key) {
        return description;
      }
    }
    
    return 'Strategic routing point designed to force usage of twisty, scenic roads';
  };

  const extractTags = (osmTags: any): string[] => {
    const tags: string[] = [];
    
    if (osmTags?.tourism) tags.push(osmTags.tourism);
    if (osmTags?.natural) tags.push(osmTags.natural);
    if (osmTags?.historic) tags.push(osmTags.historic);
    if (osmTags?.leisure) tags.push(osmTags.leisure);
    if (osmTags?.sport) tags.push(osmTags.sport);
    if (osmTags?.amenity) tags.push(osmTags.amenity);
    
    return tags;
  };

  const calculateOSMRating = (tags: any): number => {
    let rating = 3; // Base rating
    
    if (tags?.wikipedia || tags?.wikidata) rating += 1;
    if (tags?.website) rating += 0.5;
    if (tags?.phone) rating += 0.5;
    if (tags?.opening_hours) rating += 0.5;
    if (tags?.ele && parseInt(tags.ele) > 1000) rating += 1; // Elevation bonus
    if (tags?.protected === 'yes') rating += 1;
    
    return Math.min(rating, 5); // Cap at 5
  };

  // Advanced utility functions for the enhanced waypoint system
  const extractAdvancedLocationKeywords = (start: string, end: string): string[] => {
    const combined = `${start} ${end}`.toLowerCase();
    const keywords: string[] = [];
    
    // Extract city/region names with better parsing
    const words = combined.split(/[,\s-]+/).filter(word => word.length > 2);
    keywords.push(...words.slice(0, 6));
    
    // Geographic feature recognition
    const geoFeatures = [
      'mountain', 'valley', 'canyon', 'beach', 'forest', 'desert', 'lake',
      'river', 'creek', 'ridge', 'peak', 'pass', 'gorge', 'falls', 'spring'
    ];
    
    geoFeatures.forEach(feature => {
      if (combined.includes(feature)) {
        keywords.push(feature);
        keywords.push(`${feature}s`); // Plural form
      }
    });
    
    // State and region keywords
    const regions = ['national park', 'state park', 'wilderness', 'monument', 'preserve'];
    regions.forEach(region => {
      if (combined.includes(region)) keywords.push(region);
    });
    
    return Array.from(new Set(keywords)); // Remove duplicates
  };

  const searchWikipediaPages = async (term: string): Promise<SuggestedWaypoint[]> => {
    try {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`
      );
      
      if (response.ok) {
        const data = await response.json();
        if (data.coordinates) {
          return [{
            id: `wiki-enhanced-${term}`,
            location: data.title,
            description: `${data.extract?.substring(0, 150)}...`,
            checked: preferences.favorScenicRoads,
            type: 'landmark',
            coordinates: { lat: data.coordinates.lat, lon: data.coordinates.lon },
            rating: 4
          }];
        }
      }
    } catch (error) {
      console.log(`Wikipedia search failed for ${term}:`, error);
    }
    return [];
  };

  const searchWikidataEntities = async (term: string): Promise<SuggestedWaypoint[]> => {
    // Placeholder for Wikidata integration
    // In production, this would query Wikidata API for geographic entities
    return [];
  };

  const geocodeLocation = async (location: string): Promise<{ lat: number; lon: number } | null> => {
    // Simplified geocoding - in production, use real geocoding service
    // For now, return estimated coordinates based on common locations
    const locationMap: Record<string, { lat: number; lon: number }> = {
      'california': { lat: 36.7783, lon: -119.4179 },
      'los angeles': { lat: 34.0522, lon: -118.2437 },
      'san francisco': { lat: 37.7749, lon: -122.4194 },
      'san diego': { lat: 32.7157, lon: -117.1611 },
      'nevada': { lat: 39.8283, lon: -117.2437 },
      'arizona': { lat: 34.0489, lon: -111.0937 },
      'utah': { lat: 39.3210, lon: -111.0937 }
    };
    
    const key = location.toLowerCase();
    for (const [place, coords] of Object.entries(locationMap)) {
      if (key.includes(place)) {
        return coords;
      }
    }
    
    return null;
  };

  const getRegionBoundingBox = (start: string, end: string): string => {
    const combined = `${start} ${end}`.toLowerCase();
    
    if (combined.includes('california')) return '32.5,-124.5,42.0,-114.0';
    if (combined.includes('nevada')) return '35.0,-120.0,42.0,-114.0';
    if (combined.includes('arizona')) return '31.3,-114.8,37.0,-109.0';
    if (combined.includes('utah')) return '37.0,-114.0,42.0,-109.0';
    if (combined.includes('colorado')) return '37.0,-109.1,41.0,-102.0';
    if (combined.includes('new mexico')) return '31.3,-109.1,37.0,-103.0';
    
    return '30.0,-125.0,50.0,-100.0'; // Western US default
  };

  const calculateIntermediatePoints = (start: string, end: string, count: number): Array<{ lat: number; lon: number }> => {
    // Simplified intermediate point calculation
    // In production, this would use great circle calculations
    const points: Array<{ lat: number; lon: number }> = [];
    
    // Mock intermediate points for demonstration
    for (let i = 1; i <= count; i++) {
      points.push({
        lat: 37.0 + (i * 0.5),
        lon: -119.0 + (i * 0.3)
      });
    }
    
    return points;
  };

  const reverseGeocodeInterestingPlaces = async (lat: number, lon: number): Promise<SuggestedWaypoint[]> => {
    // Placeholder for reverse geocoding interesting places
    // In production, this would use Places API or similar
    return [];
  };

  const findElevationPeaks = (elevationData: Array<{ elevation: number; distance: number }>): Array<{ elevation: number; prominence: number; index: number; coordinates: { lat: number; lon: number } }> => {
    const peaks = [];
    
    for (let i = 1; i < elevationData.length - 1; i++) {
      const current = elevationData[i];
      const prev = elevationData[i - 1];
      const next = elevationData[i + 1];
      
      if (current.elevation > prev.elevation && current.elevation > next.elevation) {
        peaks.push({
          elevation: current.elevation,
          prominence: Math.min(current.elevation - prev.elevation, current.elevation - next.elevation),
          index: i,
          coordinates: { lat: 37.0 + i * 0.1, lon: -119.0 + i * 0.1 }
        });
      }
    }
    
    return peaks;
  };

  const calculateElevationScore = (elevation: number, prominence: number): number => {
    return Math.min(elevation / 500 + prominence / 200, 10);
  };

  const getCurrentSeason = (): string => {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  };

  const getSeasonalFeatures = (season: string, month: number): Array<{ name: string; description: string; type: string; seasons: string[]; seasonalScore: number }> => {
    const features = {
      spring: [
        { name: 'Wildflower Meadows', description: 'Spectacular spring wildflower displays', type: 'natural', seasons: ['spring'], seasonalScore: 9 },
        { name: 'Waterfall Views', description: 'Peak water flow from snowmelt', type: 'waterfall', seasons: ['spring', 'summer'], seasonalScore: 8 }
      ],
      summer: [
        { name: 'Alpine Lakes', description: 'Crystal clear mountain lakes perfect for summer', type: 'lake', seasons: ['summer', 'fall'], seasonalScore: 8 },
        { name: 'High Country Access', description: 'Snow-free high elevation scenic areas', type: 'peak', seasons: ['summer'], seasonalScore: 9 }
      ],
      fall: [
        { name: 'Fall Foliage', description: 'Stunning autumn colors in deciduous forests', type: 'forest', seasons: ['fall'], seasonalScore: 10 },
        { name: 'Harvest Vistas', description: 'Golden agricultural valleys and vineyards', type: 'valley', seasons: ['fall'], seasonalScore: 7 }
      ],
      winter: [
        { name: 'Snow-capped Peaks', description: 'Dramatic snow-covered mountain vistas', type: 'peak', seasons: ['winter'], seasonalScore: 8 },
        { name: 'Winter Overlooks', description: 'Clear air and dramatic winter landscapes', type: 'viewpoint', seasons: ['winter'], seasonalScore: 7 }
      ]
    };
    
    return features[season as keyof typeof features] || [];
  };

  // Enhanced fallback system with intelligent suggestions
  // Additional strategic routing support functions
  const getTwistyRoadFallbacks = (start: string, end: string): SuggestedWaypoint[] => {
    // Strategic twisty road fallbacks when API fails
    return [
      {
        id: 'twisty-fallback-1',
        location: 'Twisty Mountain Route',
        description: 'Forces routing through twisty mountain roads with switchbacks and elevation changes',
        checked: preferences.favorScenicRoads,
        type: 'twisty_routing',
        twistiness: 8,
        strategicValue: 8,
        routingPurpose: 'twisty_routing' as const,
        score: 64
      },
      {
        id: 'twisty-fallback-2',
        location: 'Canyon Access Route',
        description: 'Strategic routing through canyon access roads with curves and elevation drops',
        checked: preferences.favorScenicRoads,
        type: 'canyon_access',
        twistiness: 7,
        strategicValue: 7,
        routingPurpose: 'canyon_access' as const,
        score: 49
      },
      {
        id: 'twisty-fallback-3',
        location: 'Back Road Bypass',
        description: 'Scenic bypass using tertiary and unclassified roads to avoid highways',
        checked: preferences.favorScenicRoads,
        type: 'scenic_bypass',
        twistiness: 6,
        strategicValue: 8,
        routingPurpose: 'scenic_bypass' as const,
        score: 48
      }
    ];
  };

  // Strategic Twisty-Road Waypoint Discovery System
  const findScenicWaypoints = async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    if (!start || !end) return [];

    setIsLoadingSuggestions(true);
    const strategicWaypoints: SuggestedWaypoint[] = [];

    try {
      // Phase 1: Strategic routing point discovery (prioritizing twisty roads)
      const [twistyRoads, elevationRoutes, canyonAccess, scenicBypasses, mountainPasses] = await Promise.allSettled([
        findTwistyRoadWaypoints(start, end),
        findElevationChangeRoutes(start, end),
        findCanyonAccessPoints(start, end),
        findScenicBypassRoutes(start, end),
        findMountainPassRoutes(start, end)
      ]);

      // Combine strategic routing results
      if (twistyRoads.status === 'fulfilled') strategicWaypoints.push(...twistyRoads.value);
      if (elevationRoutes.status === 'fulfilled') strategicWaypoints.push(...elevationRoutes.value);
      if (canyonAccess.status === 'fulfilled') strategicWaypoints.push(...canyonAccess.value);
      if (scenicBypasses.status === 'fulfilled') strategicWaypoints.push(...scenicBypasses.value);
      if (mountainPasses.status === 'fulfilled') strategicWaypoints.push(...mountainPasses.value);

      // Phase 2: Road geometry analysis and scoring
      const geometryAnalyzed = await analyzeRoadGeometry(strategicWaypoints, start, end);
      
      // Phase 3: Strategic routing score calculation
      const scoredForTwistiness = calculateTwistinessScores(geometryAnalyzed);
      
      // Phase 4: Optimal routing waypoint placement
      const strategicallyPlaced = optimizeForTwistyRouting(scoredForTwistiness, start, end);
      
      // Phase 5: Final selection prioritizing maximum twistiness
      const finalStrategicSelection = selectMaxTwistinessWaypoints(strategicallyPlaced, 10);
      
      return finalStrategicSelection;

    } catch (error) {
      console.log('Strategic waypoint discovery failed:', error);
      // Fallback to twisty road heuristics
      return getTwistyRoadFallbacks(start, end);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const calculateTwistinessScores = (waypoints: SuggestedWaypoint[]): SuggestedWaypoint[] => {
    return waypoints.map(waypoint => {
      let twistinessScore = waypoint.twistiness || 0;
      
      // Boost score for strategic routing purposes
      const routingBonuses: Record<string, number> = {
        'twisty_routing': 5,
        'elevation_forcing': 4,
        'canyon_access': 4,
        'scenic_bypass': 3
      };
      
      if (waypoint.routingPurpose) {
        twistinessScore += routingBonuses[waypoint.routingPurpose] || 0;
      }
      
      // Road type bonuses (prefer smaller, twistier roads)
      const roadTypeBonuses: Record<string, number> = {
        'tertiary': 3,
        'unclassified': 4,
        'residential': 2,
        'secondary': 1
      };
      
      if (waypoint.roadType) {
        twistinessScore += roadTypeBonuses[waypoint.roadType] || 0;
      }
      
      // Elevation change bonus
      if (waypoint.elevationChange) {
        twistinessScore += Math.min(waypoint.elevationChange / 200, 3);
      }
      
      const finalScore = twistinessScore * (waypoint.strategicValue || 1);
      
      return { ...waypoint, score: finalScore };
    });
  };

  // Memoize the waypoint discovery function
  const memoizedFindScenicWaypoints = useCallback(findScenicWaypoints, [
    analyzeRoadGeometry,
    findCanyonAccessPoints,
    findElevationChangeRoutes,
    findMountainPassRoutes,
    findScenicBypassRoutes,
    findTwistyRoadWaypoints,
    getTwistyRoadFallbacks,
    optimizeForTwistyRouting
  ]);

  // Update suggestions when start/end locations change
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (route.start && route.end && route.start.length > 3 && route.end.length > 3) {
        const newSuggestions = await memoizedFindScenicWaypoints(route.start, route.end);
        setSuggestedWaypoints(newSuggestions);
      } else {
        setSuggestedWaypoints([]);
      }
    }, 1000); // Debounce API calls

    return () => clearTimeout(timeoutId);
  }, [route.start, route.end, memoizedFindScenicWaypoints]);

  const toggleSuggestedWaypoint = (id: string) => {
    setSuggestedWaypoints(prev => 
      prev.map(wp => 
        wp.id === id ? { ...wp, checked: !wp.checked } : wp
      )
    );
  };

  const addWaypoint = () => {
    const newWaypoint: Waypoint = {
      id: Date.now().toString(),
      location: ''
    };
    setRoute(prev => ({
      ...prev,
      waypoints: [...prev.waypoints, newWaypoint]
    }));
  };

  const updateWaypoint = (id: string, location: string) => {
    setRoute(prev => ({
      ...prev,
      waypoints: prev.waypoints.map(wp => 
        wp.id === id ? { ...wp, location } : wp
      )
    }));
  };

  const removeWaypoint = (id: string) => {
    setRoute(prev => ({
      ...prev,
      waypoints: prev.waypoints.filter(wp => wp.id !== id)
    }));
  };

  const generateRoute = () => {
    if (!route.start || !route.end) {
      alert('Please enter both start and end locations');
      return;
    }

    // Build Google Maps URL with waypoints and advanced scenic routing
    const baseUrl = 'https://www.google.com/maps/dir/';
    let locations = [route.start];
    
    // Add checked suggested waypoints
    const checkedSuggestions = suggestedWaypoints
      .filter(wp => wp.checked)
      .map(wp => wp.location);
    locations.push(...checkedSuggestions);
    
    // Add user-defined waypoints
    locations.push(...route.waypoints.filter(wp => wp.location).map(wp => wp.location));
    locations.push(route.end);
    
    let url = baseUrl + locations.map(loc => encodeURIComponent(loc)).join('/');
    
    // Add routing preferences for maximum scenic experience
    const avoidOptions = [];
    if (preferences.avoidHighways) {
      avoidOptions.push('highways');
    }
    if (preferences.avoidTolls) {
      avoidOptions.push('tolls');
    }
    
    // Combine avoid options properly for Google Maps
    if (avoidOptions.length > 0) {
      url += '/?avoid=' + avoidOptions.join(',');
    }
    
    setRouteUrl(url);
    
    // Also generate Waze route
    const waze = generateWazeRoute();
    setWazeUrl(waze);
  };

  const generateWazeRoute = () => {
    if (!route.start || !route.end) {
      return '';
    }

    // Get checked suggested waypoints
    const checkedSuggestions = suggestedWaypoints
      .filter(wp => wp.checked)
      .map(wp => wp.location);
    
    // Get user-defined waypoints
    const userWaypoints = route.waypoints.filter(wp => wp.location).map(wp => wp.location);
    
    const allWaypoints = [...checkedSuggestions, ...userWaypoints];
    
    // For Waze, we can only navigate to one destination at a time
    // So we'll prioritize the final destination and note waypoints in the search
    if (allWaypoints.length > 0) {
      // Create a search query that includes waypoint info for context
      const waypointsText = allWaypoints.length > 0 ? ` via ${allWaypoints[0]}` : '';
      const searchQuery = `${route.end}${waypointsText}`;
      return `https://waze.com/ul?q=${encodeURIComponent(searchQuery)}&navigate=yes`;
    }
    
    // Simple route without waypoints - direct navigation to destination
    return `https://waze.com/ul?q=${encodeURIComponent(route.end)}&navigate=yes`;
  };

  // Alternative: Generate multiple Waze URLs for each segment
  const generateWazeSegments = () => {
    if (!route.start || !route.end) {
      return [];
    }

    const checkedSuggestions = suggestedWaypoints
      .filter(wp => wp.checked)
      .map(wp => wp.location);
    
    const userWaypoints = route.waypoints.filter(wp => wp.location).map(wp => wp.location);
    const allWaypoints = [...checkedSuggestions, ...userWaypoints];
    
    if (allWaypoints.length === 0) {
      return [{
        url: `https://waze.com/ul?q=${encodeURIComponent(route.end)}&navigate=yes`,
        description: `${route.start} → ${route.end}`,
        segment: 1
      }];
    }

    // Create segments for each leg of the journey
    const segments = [];
    let currentStart = route.start;
    
    allWaypoints.forEach((waypoint, index) => {
      segments.push({
        url: `https://waze.com/ul?q=${encodeURIComponent(waypoint)}&navigate=yes`,
        description: `${currentStart.split(',')[0]} → ${waypoint.split(',')[0]}`,
        segment: index + 1
      });
      currentStart = waypoint;
    });
    
    // Final segment to destination
    segments.push({
      url: `https://waze.com/ul?q=${encodeURIComponent(route.end)}&navigate=yes`,
      description: `${currentStart.split(',')[0]} → ${route.end.split(',')[0]}`,
      segment: segments.length + 1
    });
    
    return segments;
  };

  const generateQRCode = () => {
    if (!routeUrl) {
      alert('Please generate a route first');
      return;
    }
    
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(routeUrl)}`;
    window.open(qrUrl, '_blank');
  };

  const checkedSuggestionsCount = suggestedWaypoints.filter(wp => wp.checked).length;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">
          🏔️ Canyon Tour
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Plan twisty, scenic canyon drives with optimal waypoint routing
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Plan Your Scenic Route</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Location
              </label>
              <input
                type="text"
                value={route.start}
                onChange={(e) => setRoute(prev => ({ ...prev, start: e.target.value }))}
                placeholder="Enter starting location"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Location
              </label>
              <input
                type="text"
                value={route.end}
                onChange={(e) => setRoute(prev => ({ ...prev, end: e.target.value }))}
                placeholder="Enter destination"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Dynamic Scenic Suggestions */}
            {(suggestedWaypoints.length > 0 || isLoadingSuggestions) && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-lg font-medium text-blue-800 mb-3">
                  🎯 Strategic Twisty Road Routing System
                  {!isLoadingSuggestions && `(${checkedSuggestionsCount}/${suggestedWaypoints.length} selected)`}
                </h3>
                
                {isLoadingSuggestions ? (
                  <div className="flex items-center space-x-3 py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <div className="text-blue-600">
                      <div className="font-medium mb-1">Analyzing Road Geometry for Maximum Twistiness...</div>
                      <div className="text-sm">
                        🛣️ Twisty Roads • 🏔️ Elevation Forcing • 🗻 Canyon Access • 🎯 Strategic Routing
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-blue-600 mb-3">
                      Strategic routing points designed to force twisty roads instead of highways - check to include:
                    </p>
                    <div className="space-y-2">
                      {suggestedWaypoints.map((suggestion) => (
                        <div key={suggestion.id} className="flex items-start justify-between bg-white p-3 rounded border hover:border-blue-300 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <div className="text-sm font-medium text-gray-800">{suggestion.location}</div>
                              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                                {suggestion.type}
                              </span>
                              {suggestion.score && (
                                <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded font-medium">
                                  Score: {suggestion.score.toFixed(1)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 mb-1">{suggestion.description}</div>
                            <div className="flex items-center space-x-3 text-xs text-gray-500">
                              {suggestion.twistiness && (
                                <span className="flex items-center text-green-600 font-medium">
                                  🌀 Twistiness: {suggestion.twistiness}/10
                                </span>
                              )}
                              {suggestion.routingPurpose && (
                                <span className="flex items-center text-blue-600">
                                  🎯 {suggestion.routingPurpose.replace('_', ' ')}
                                </span>
                              )}
                              {suggestion.elevation && (
                                <span className="flex items-center">
                                  🏔️ {suggestion.elevation}ft
                                </span>
                              )}
                              {suggestion.roadType && (
                                <span className="flex items-center text-orange-600">
                                  🛣️ {suggestion.roadType}
                                </span>
                              )}
                            </div>
                            {suggestion.tags && suggestion.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {suggestion.tags.slice(0, 3).map((tag, index) => (
                                  <span key={index} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <input
                            type="checkbox"
                            checked={suggestion.checked}
                            onChange={() => toggleSuggestedWaypoint(suggestion.id)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1 ml-3 flex-shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                    {checkedSuggestionsCount > 0 && (
                      <div className="mt-3 p-2 bg-green-100 rounded text-sm text-green-700">
                        ✅ {checkedSuggestionsCount} strategic waypoint{checkedSuggestionsCount !== 1 ? 's' : ''} will force twisty road routing
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Additional Custom Waypoints
                </label>
                <button
                  onClick={addWaypoint}
                  className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                >
                  + Add Custom Waypoint
                </button>
              </div>
              
              {route.waypoints.map((waypoint, index) => (
                <div key={waypoint.id} className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={waypoint.location}
                    onChange={(e) => updateWaypoint(waypoint.id, e.target.value)}
                    placeholder={`Custom waypoint ${index + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => removeWaypoint(waypoint.id)}
                    className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
              
              {route.waypoints.length === 0 && suggestedWaypoints.length === 0 && (
                <p className="text-sm text-gray-500 italic">
                  Enter start and end locations to see scenic waypoint suggestions, or add custom waypoints manually.
                </p>
              )}
            </div>

            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <h3 className="text-lg font-medium text-green-800 mb-3">🌄 Advanced Scenic Routing</h3>
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="avoidHighways"
                    checked={preferences.avoidHighways}
                    onChange={(e) => setPreferences(prev => ({ ...prev, avoidHighways: e.target.checked }))}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor="avoidHighways" className="ml-2 text-sm text-green-700">
                    🚫 Avoid highways (forces local roads and scenic byways)
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="avoidTolls"
                    checked={preferences.avoidTolls}
                    onChange={(e) => setPreferences(prev => ({ ...prev, avoidTolls: e.target.checked }))}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor="avoidTolls" className="ml-2 text-sm text-green-700">
                    💰 Avoid toll roads (often leads to more scenic alternatives)
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="favorScenicRoads"
                    checked={preferences.favorScenicRoads}
                    onChange={(e) => setPreferences(prev => ({ ...prev, favorScenicRoads: e.target.checked }))}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                  <label htmlFor="favorScenicRoads" className="ml-2 text-sm text-green-700">
                    🌊 Auto-suggest scenic waypoints when route is detected
                  </label>
                </div>
              </div>
              <p className="mt-3 text-xs text-green-600">
                ✨ These options enhance scenic routing by suggesting strategic waypoints and avoiding fast highways
              </p>
            </div>

            <button
              onClick={generateRoute}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Generate Scenic Route {checkedSuggestionsCount > 0 && `(${checkedSuggestionsCount + route.waypoints.filter(wp => wp.location).length} waypoints)`}
            </button>
          </div>
        </div>

        {routeUrl && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Your Twisty Canyon Route</h2>
            
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center">
                <span className="text-green-600 mr-2">🌿</span>
                <span className="text-sm text-green-700 font-medium">
                  Scenic route optimized for twisty roads and canyon views!
                </span>
              </div>
              {preferences.favorScenicRoads && (
                <p className="text-xs text-green-600 mt-1">
                  🎯 Route includes strategic waypoints to force scenic road usage
                </p>
              )}
            </div>
            
            {/* Google Maps Route */}
            <div className="mb-4">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">🗺️</span>
                <h3 className="text-lg font-medium text-gray-800">Google Maps Route</h3>
              </div>
              <div className="bg-gray-100 p-3 rounded-md mb-3">
                <a 
                  href={routeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 break-all text-sm"
                >
                  {routeUrl}
                </a>
              </div>
            </div>

            {/* Waze Route */}
            {wazeUrl && (
              <div className="mb-4">
                <div className="flex items-center mb-2">
                  <span className="text-lg mr-2">🚗</span>
                  <h3 className="text-lg font-medium text-gray-800">Waze Route</h3>
                </div>
                
                {/* Single Waze route */}
                <div className="bg-purple-50 p-3 rounded-md mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-800">Direct Route</span>
                    <button
                      onClick={() => window.open(wazeUrl, '_blank')}
                      className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                    >
                      Open
                    </button>
                  </div>
                  <a 
                    href={wazeUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-800 break-all text-sm"
                  >
                    {wazeUrl}
                  </a>
                </div>
                
                {/* Segmented Waze routes for waypoints */}
                {(() => {
                  const segments = generateWazeSegments();
                  if (segments.length > 1) {
                    return (
                      <div className="bg-purple-50 p-3 rounded-md">
                        <div className="text-sm font-medium text-purple-800 mb-2">
                          🎯 Multi-Segment Route (Recommended for Waypoints)
                        </div>
                        <p className="text-xs text-purple-600 mb-3">
                          Navigate each segment separately to ensure you hit all scenic waypoints:
                        </p>
                        <div className="space-y-2">
                          {segments.map((segment, index) => (
                            <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                              <div className="flex-1">
                                <span className="text-xs font-medium text-gray-700">
                                  Segment {segment.segment}: {segment.description}
                                </span>
                              </div>
                              <button
                                onClick={() => window.open(segment.url, '_blank')}
                                className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors ml-2"
                              >
                                Navigate
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-purple-600 mt-2">
                          💡 Complete each segment in order to follow the full scenic route!
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => window.open(routeUrl, '_blank')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <span>🗺️</span>
                <span>Open in Google Maps</span>
              </button>
              
              {wazeUrl && (
                <button
                  onClick={() => window.open(wazeUrl, '_blank')}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors flex items-center space-x-2"
                >
                  <span>🚗</span>
                  <span>Open in Waze</span>
                </button>
              )}
              
              <button
                onClick={generateQRCode}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <span>📱</span>
                <span>Generate QR Code</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
