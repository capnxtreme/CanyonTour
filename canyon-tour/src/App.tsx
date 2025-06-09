import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';
import InteractiveMap from './InteractiveMap';

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
  score?: number;
  coordinates?: { lat: number; lon: number };
  twistiness?: number;
  strategicValue?: number;
  routingPurpose?: 'twisty_routing' | 'elevation_forcing' | 'scenic_bypass' | 'canyon_access';
  roadType?: string;
  elevation?: number;
  elevationChange?: number;
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

  // --- Core Utility Functions ---

  const geocodeLocation = useCallback(async (location: string): Promise<{ lat: number; lon: number } | null> => {
    console.log('1. Geocoding location with Google API:', location);
    try {
      const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('❌ FATAL: Google Maps API key not found. Please set REACT_APP_GOOGLE_MAPS_API_KEY.');
        return null;
      }
      console.log('  - API key found.');
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`
      );
      if (!response.ok) {
        console.error('  - ❌ Geocoding API request failed:', response.status, response.statusText);
        return null;
      }
      const data = await response.json();
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const result = data.results[0];
        const coords = {
          lat: result.geometry.location.lat,
          lon: result.geometry.location.lng
        };
        console.log('  - ✅ Successfully geocoded:', location, '→', coords);
        return coords;
      } else {
        console.log('  - ❌ Geocoding failed for:', location, 'Status:', data.status);
        return null;
      }
    } catch (error) {
      console.error('  - ❌ Geocoding error:', error);
      return null;
    }
  }, []);

  const getEnhancedRouteBoundingBox = useCallback(async (start: string, end: string): Promise<string | null> => {
    console.log('2. Calculating enhanced route bounding box...');
    try {
      const startCoords = await geocodeLocation(start);
      const endCoords = await geocodeLocation(end);
      if (!startCoords || !endCoords) {
        console.error("  - ❌ Couldn't get coordinates for start or end. Aborting.");
        return null;
      };
      
      const minLat = Math.min(startCoords.lat, endCoords.lat);
      const maxLat = Math.max(startCoords.lat, endCoords.lat);
      const minLon = Math.min(startCoords.lon, endCoords.lon);
      const maxLon = Math.max(startCoords.lon, endCoords.lon);
      
      const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
      console.log('  - ✅ Calculated bounding box:', bbox);
      return bbox;
    } catch (error) {
      console.log('  - ❌ Failed to get route bounding box:', error);
      return null;
    }
  }, [geocodeLocation]);

  const calculateRoadTwistiness = useCallback((element: any): number => {
    const tags = element.tags || {};
    let twistiness = 0;
    if (tags.highway === 'tertiary') twistiness += 3;
    if (tags.highway === 'unclassified') twistiness += 4;
    if (tags.highway === 'residential') twistiness += 2;
    if (tags.mountain_pass === 'yes') twistiness += 5;
    if (tags.surface === 'unpaved' || tags.surface === 'gravel' || tags.surface === 'dirt') twistiness += 2;
    if (tags.natural === 'saddle' || tags.natural === 'pass') twistiness += 3;
    return Math.min(twistiness, 10);
  }, []);

  const calculateStrategicRoutingValue = useCallback((tags: any): number => {
    let value = 0;
    if (tags.highway === 'give_way' || tags.highway === 'stop') value += 3;
    if (tags.barrier === 'cattle_grid' || tags.barrier === 'height_restrictor') value += 4;
    if (tags.highway === 'turning_circle' || tags.junction === 'roundabout') value += 2;
    if (tags.place === 'hamlet' || tags.place === 'village' || tags.place === 'locality') value += 3;
    return Math.min(value, 10);
  }, []);

  const determineRoutingPurpose = useCallback((tags: any): 'twisty_routing' | 'elevation_forcing' | 'scenic_bypass' | 'canyon_access' => {
    if (tags.mountain_pass === 'yes' || tags.natural === 'pass') return 'elevation_forcing';
    if (tags.natural === 'saddle' || tags.natural === 'ridge') return 'canyon_access';
    if (tags.highway === 'tertiary' || tags.highway === 'unclassified') return 'twisty_routing';
    return 'scenic_bypass';
  }, []);

  const generateStrategicRoutingName = useCallback((tags: any, elementType: string): string => {
    if (tags?.name) return `${tags.name}`;
    if (tags?.highway) return `Twisty ${tags.highway.charAt(0).toUpperCase() + tags.highway.slice(1)} Route`;
    if (tags?.natural === 'pass') return 'Mountain Pass Route';
    if (tags?.natural === 'saddle') return 'Ridge Crossing Route';
    if (tags?.place) return `${tags.place.charAt(0).toUpperCase() + tags.place.slice(1)} Bypass`;
    return `Strategic Point`;
  }, []);

  const getStrategicRoutingDescription = useCallback((tags: any): string => {
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
  }, []);

  const calculateDistance = useCallback((coord1?: { lat: number; lon: number }, coord2?: { lat: number; lon: number }): number => {
    if (!coord1 || !coord2) return 0;
    const R = 6371;
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLon = (coord2.lon - coord1.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []);

  // --- Waypoint Discovery & Processing ---

  const findTwistyRoadWaypoints = useCallback(async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    console.log('3. Finding twisty road waypoints...');
    try {
      const bbox = await getEnhancedRouteBoundingBox(start, end);
      if (!bbox) return [];

      const overpassQuery = `
        [out:json][timeout:25];
        (
          way["highway"~"^(tertiary|unclassified|residential)$"][bbox:${bbox}];
          way["highway"="secondary"]["lanes"~"^(1|2)$"][bbox:${bbox}];
          way["highway"]["mountain_pass"="yes"][bbox:${bbox}];
          way["highway"~"^(tertiary|unclassified)$"]["surface"~"^(unpaved|gravel|dirt)$"][bbox:${bbox}];
          node["highway"="give_way"][bbox:${bbox}];
          node["highway"="stop"][bbox:${bbox}];
          node["barrier"~"^(cattle_grid|height_restrictor)$"][bbox:${bbox}];
          node["highway"="turning_circle"][bbox:${bbox}];
          way["junction"="roundabout"][bbox:${bbox}];
          node["place"~"^(hamlet|village)$"][bbox:${bbox}];
          node["natural"~"^(saddle|pass|ridge)$"][bbox:${bbox}];
        );
        out geom meta;`;

      console.log('  - - Executing Overpass query...');
      const response = await fetch(`https://overpass-api.de/api/interpreter`, {
        method: 'POST',
        body: overpassQuery,
      });

      console.log('  - Overpass API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log(`  - ✅ Overpass query successful. Found ${data.elements?.length || 0} potential elements.`);
        if ((data.elements?.length || 0) === 0) {
          console.log('  - No elements returned from Overpass. The query might be too restrictive or the area has no matching features.');
        }
        return data.elements?.map((element: any) => {
          const name = generateStrategicRoutingName(element.tags, element.type);
          const lat = element.lat || (element.bounds ? (element.bounds.minlat + element.bounds.maxlat) / 2 : 0);
          const lon = element.lon || (element.bounds ? (element.bounds.minlon + element.bounds.maxlon) / 2 : 0);
          
          const twistiness = calculateRoadTwistiness(element);
          const strategicValue = calculateStrategicRoutingValue(element.tags);
          
          return {
            id: `twisty-${element.id}`,
            location: name,
            description: getStrategicRoutingDescription(element.tags),
            checked: true,
            type: 'strategic_routing',
            coordinates: { lat, lon },
            roadType: element.tags?.highway || 'unknown',
            twistiness: twistiness,
            strategicValue: strategicValue,
            routingPurpose: determineRoutingPurpose(element.tags),
            score: twistiness * strategicValue,
          };
        }).filter((w: any) => w.twistiness > 3) || [];
      } else {
        console.error(`  - ❌ Overpass API request failed with status: ${response.status}`);
        const errorBody = await response.text();
        console.error('  - Error body:', errorBody);
      }
    } catch (error) {
      console.log('  - ❌ Advanced OSM query fetch failed:', error);
    }
    return [];
  }, [getEnhancedRouteBoundingBox, generateStrategicRoutingName, calculateRoadTwistiness, calculateStrategicRoutingValue, getStrategicRoutingDescription, determineRoutingPurpose]);

  const optimizeForTwistyRouting = useCallback((waypoints: SuggestedWaypoint[]): SuggestedWaypoint[] => {
    console.log(`4. Optimizing and filtering ${waypoints.length} waypoints...`);
    const sorted = waypoints.sort((a, b) => (b.score || 0) - (a.score || 0));
    const finalWaypoints = sorted.filter((waypoint, index) => {
      if ((waypoint.score || 0) > 50) return true;
      if (index < 5) return true;
      const selected = sorted.slice(0, index);
      return !selected.some(selectedWp => 
        calculateDistance(waypoint.coordinates, selectedWp.coordinates) < 15
      );
    });
    console.log(`  - ✅ Optimization complete. Final waypoint count: ${finalWaypoints.length}`);
    return finalWaypoints;
  }, [calculateDistance]);
  
  const findScenicWaypoints = useCallback(async (start: string, end: string): Promise<SuggestedWaypoint[]> => {
    if (!start || !end) return [];
    setIsLoadingSuggestions(true);
    try {
      console.log('--- Initiating Scenic Waypoint Discovery ---');
      console.log(`Searching for twisty roads between: "${start}" and "${end}"`);
      const twistyRoads = await findTwistyRoadWaypoints(start, end);
      
      if (!twistyRoads || twistyRoads.length === 0) {
        console.log('No twisty road waypoints found. Aborting optimization.');
        return [];
      }
      
      const strategicallyPlaced = optimizeForTwistyRouting(twistyRoads);
      console.log('--- Scenic Waypoint Discovery Finished ---');
      return strategicallyPlaced.slice(0, 10);

    } catch (error) {
      console.log('❌ Top-level strategic waypoint discovery failed:', error);
      return [];
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [findTwistyRoadWaypoints, optimizeForTwistyRouting]);

  // --- Main App Logic & State ---

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (route.start && route.end && route.start.length > 3 && route.end.length > 3) {
        console.log('🏁 useEffect triggered: Start and end locations are present. Searching for waypoints...');
        const newSuggestions = await findScenicWaypoints(route.start, route.end);
        setSuggestedWaypoints(newSuggestions);
      } else {
        console.log('useEffect triggered: Start or end location is missing. Clearing suggestions.');
        setSuggestedWaypoints([]);
      }
    }, 1000);

    return () => clearTimeout(handler);
  }, [route.start, route.end, findScenicWaypoints]);

  const addWaypoint = () => {
    setRoute(prev => ({
      ...prev,
      waypoints: [...prev.waypoints, { id: Date.now().toString(), location: '' }]
    }));
  };

  const updateWaypoint = (id: string, location: string) => {
    setRoute(prev => ({
      ...prev,
      waypoints: prev.waypoints.map(wp => wp.id === id ? { ...wp, location } : wp)
    }));
  };

  const removeWaypoint = (id: string) => {
    setRoute(prev => ({
      ...prev,
      waypoints: prev.waypoints.filter(wp => wp.id !== id)
    }));
  };

  const toggleSuggestedWaypoint = (id: string) => {
    setSuggestedWaypoints(prev => 
      prev.map(wp => wp.id === id ? { ...wp, checked: !wp.checked } : wp)
    );
  };
  
  const generateRouteURL = (waypoints: (string | {lat: number, lon: number})[]) => {
    const locations = [
      route.start,
      ...waypoints.map(wp => {
        if (typeof wp === 'string') return wp;
        return `${wp.lat},${wp.lon}`;
      }),
      route.end
    ];
  
    const baseUrl = 'https://www.google.com/maps/dir/';
    let url = baseUrl + locations.map(loc => encodeURIComponent(loc)).join('/');
    
    const avoidOptions = [];
    if (preferences.avoidHighways) avoidOptions.push('highways');
    if (preferences.avoidTolls) avoidOptions.push('tolls');
    
    if (avoidOptions.length > 0) {
      url += '/?avoid=' + avoidOptions.join(',');
    }
    return url;
  }

  const handleGenerateRoute = () => {
    if (!route.start || !route.end) {
      alert('Please enter both start and end locations');
      return;
    }

    const waypointsForUrl = [
        ...suggestedWaypoints.filter(wp => wp.checked).map(wp => wp.coordinates ? {lat: wp.coordinates.lat, lon: wp.coordinates.lon} : wp.location),
        ...route.waypoints.filter(wp => wp.location).map(wp => wp.location)
    ];

    const googleUrl = generateRouteURL(waypointsForUrl);
    setRouteUrl(googleUrl);

    // Waze can't handle multiple waypoints well, so we generate a direct route and segmented routes.
    const wazeDestination = route.waypoints.length > 0 ? route.waypoints[0].location : route.end;
    setWazeUrl(`https://waze.com/ul?q=${encodeURIComponent(wazeDestination)}&navigate=yes`);
  };

  const generateWazeSegments = () => {
    const allWaypoints = [
        ...suggestedWaypoints.filter(wp => wp.checked).map(wp => wp.location),
        ...route.waypoints.filter(wp => wp.location).map(wp => wp.location)
    ];
    if (allWaypoints.length === 0) return [];

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
    segments.push({
        url: `https://waze.com/ul?q=${encodeURIComponent(route.end)}&navigate=yes`,
        description: `${currentStart.split(',')[0]} → ${route.end.split(',')[0]}`,
        segment: segments.length + 1
    });
    return segments;
  };

  const checkedSuggestionsCount = suggestedWaypoints.filter(wp => wp.checked).length;

  return (
    <div className="app-container">
      <div className="controls-container">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Location</label>
                <input
                  type="text"
                  value={route.start}
                  onChange={(e) => setRoute(prev => ({ ...prev, start: e.target.value }))}
                  placeholder="Enter starting location"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">End Location</label>
                <input
                  type="text"
                  value={route.end}
                  onChange={(e) => setRoute(prev => ({ ...prev, end: e.target.value }))}
                  placeholder="Enter destination"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {(suggestedWaypoints.length > 0 || isLoadingSuggestions) && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h3 className="text-lg font-medium text-blue-800 mb-3">
                    🎯 Strategic Twisty Road Suggestions
                    {!isLoadingSuggestions && ` (${checkedSuggestionsCount}/${suggestedWaypoints.length} selected)`}
                  </h3>
                  
                  {isLoadingSuggestions ? (
                    <div className="flex items-center space-x-3 py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <div className="text-blue-600 font-medium">Analyzing roads for maximum twistiness...</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suggestedWaypoints.map((suggestion) => (
                        <div key={suggestion.id} className="flex items-start justify-between bg-white p-3 rounded border hover:border-blue-300 transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <div className="text-sm font-medium text-gray-800">{suggestion.location}</div>
                              <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                                Twistiness: {Math.round(suggestion.score || 0)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">{suggestion.description}</p>
                          </div>
                          <input 
                            type="checkbox"
                            checked={suggestion.checked}
                            onChange={() => toggleSuggestedWaypoint(suggestion.id)}
                            className="h-5 w-5 ml-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Additional Custom Waypoints</label>
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
              </div>

              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h3 className="text-lg font-medium text-green-800 mb-3">🌄 Advanced Scenic Routing</h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <input type="checkbox" id="avoidHighways" checked={preferences.avoidHighways} onChange={(e) => setPreferences(prev => ({ ...prev, avoidHighways: e.target.checked }))} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"/>
                    <label htmlFor="avoidHighways" className="ml-2 text-sm text-green-700">🚫 Avoid highways</label>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" id="avoidTolls" checked={preferences.avoidTolls} onChange={(e) => setPreferences(prev => ({ ...prev, avoidTolls: e.target.checked }))} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"/>
                    <label htmlFor="avoidTolls" className="ml-2 text-sm text-green-700">💰 Avoid toll roads</label>
                  </div>
                  <div className="flex items-center">
                    <input type="checkbox" id="favorScenicRoads" checked={preferences.favorScenicRoads} onChange={(e) => setPreferences(prev => ({ ...prev, favorScenicRoads: e.target.checked }))} className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"/>
                    <label htmlFor="favorScenicRoads" className="ml-2 text-sm text-green-700">🌊 Auto-suggest scenic waypoints</label>
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerateRoute}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                Generate Scenic Route {checkedSuggestionsCount > 0 && `(${checkedSuggestionsCount + route.waypoints.filter(wp => wp.location).length} waypoints)`}
              </button>
            </div>
          </div>

          {routeUrl && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-semibold mb-4">Your Twisty Canyon Route</h2>
              
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-800">Google Maps Route</h3>
                <div className="bg-gray-100 p-3 rounded-md mb-3">
                  <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all text-sm">{routeUrl}</a>
                </div>
              </div>

              {wazeUrl && (
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-800">Waze Route</h3>
                  <div className="bg-purple-50 p-3 rounded-md mb-3">
                    <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-800 break-all text-sm">{wazeUrl}</a>
                  </div>
                  
                  {(() => {
                    const segments = generateWazeSegments();
                    if (segments.length > 1) {
                      return (
                        <div className="bg-purple-50 p-3 rounded-md">
                          <div className="text-sm font-medium text-purple-800 mb-2">Multi-Segment Route</div>
                          <div className="space-y-2">
                            {segments.map((segment, index) => (
                              <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                                <span className="text-xs font-medium text-gray-700">Segment {segment.segment}: {segment.description}</span>
                                <button onClick={() => window.open(segment.url, '_blank')} className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors ml-2">Open</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              <div className="mt-6">
                <h3 className="text-lg font-medium text-gray-800 mb-2">Share Your Route</h3>
                <div className="flex items-center space-x-4">
                  <div className="w-40 h-40 p-2 border rounded-md bg-white">
                    {routeUrl && <QRCodeSVG value={routeUrl} size={150} />}
                  </div>
                  <p className="text-sm text-gray-600 flex-1">Scan this QR code with your phone to open the route directly in Google Maps.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="map-container">
        <InteractiveMap
          start={route.start}
          end={route.end}
          waypoints={route.waypoints}
          suggestedWaypoints={suggestedWaypoints}
          onWaypointAdd={(location) => {
            setRoute(prev => ({
              ...prev,
              waypoints: [...prev.waypoints, { id: Date.now().toString(), location }]
            }));
          }}
          onWaypointUpdate={updateWaypoint}
          onWaypointRemove={removeWaypoint}
          onSuggestedWaypointToggle={toggleSuggestedWaypoint}
          preferences={preferences}
        />
      </div>
    </div>
  );
}

export default App;
