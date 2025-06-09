import React, { useState, useCallback, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './App.css';
import InteractiveMap from './InteractiveMap';
import { Route, RoutePreferences, SuggestedWaypoint, RouteOption } from './types';
import { geocodeLocation, getEnhancedRouteBoundingBox } from './services/googleMapsService';
import { findTwistyRoadWaypoints } from './services/osmService';
import { optimizeForTwistyRouting, generateRouteOptions } from './utils/routingUtils';
import { useDebounce } from './hooks/useDebounce';

function App() {
  const [route, setRoute] = useState<Route>({
    start: '',
    end: '',
    waypoints: []
  });
  const debouncedRoute = useDebounce(route, 500);
  const [routeUrl, setRouteUrl] = useState<string>('');
  const [wazeUrl, setWazeUrl] = useState<string>('');
  const [preferences, setPreferences] = useState<RoutePreferences>({
    avoidHighways: true,
    avoidTolls: true,
    favorScenicRoads: true
  });
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    directionsRendererRef.current = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
    });
  }, []);

  const handleSearch = useCallback(async () => {
    if (!route.start || !route.end) {
      return;
    }

    setIsLoadingSuggestions(true);
    setRouteOptions([]);
    setSelectedRouteIndex(null);
    console.log('--- Initiating Scenic Waypoint Discovery ---');
    console.log(`Searching for twisty roads between: "${route.start}" and "${route.end}"`);

    try {
      const twistyRoads = await findTwistyRoadWaypoints(route.start, route.end);
      
      if (!twistyRoads || twistyRoads.length === 0) {
        console.log('No twisty road waypoints found. Aborting optimization.');
      } else {
        const startCoords = await geocodeLocation(route.start);
        const endCoords = await geocodeLocation(route.end);

        if (startCoords && endCoords) {
          const options = generateRouteOptions(twistyRoads, startCoords, endCoords);
          const optionsWithChecked = options.map(opt => ({
            ...opt,
            waypoints: opt.waypoints.map(wp => ({ ...wp, checked: true }))
          }));
          console.log('--- Scenic Waypoint Discovery Finished ---');
          setRouteOptions(optionsWithChecked);
          if (optionsWithChecked.length > 0) {
            setSelectedRouteIndex(0);
          }
        }
      }
    } catch (error) {
      console.log('❌ Top-level strategic waypoint discovery failed:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [route.start, route.end]);

  const activeWaypoints = selectedRouteIndex !== null ? routeOptions[selectedRouteIndex]?.waypoints.filter(wp => wp.checked) : [];

  useEffect(() => {
    const renderRoute = async () => {
      if (!directionsRendererRef.current) {
        return;
      }

      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];

      if (!route.start || !route.end || activeWaypoints.length === 0) {
        directionsRendererRef.current.setDirections(null);
        return;
      }

      const directionsService = new google.maps.DirectionsService();

      const waypoints = activeWaypoints
        .filter((wp): wp is SuggestedWaypoint & { coordinates: { lat: number; lon: number } } => 
          wp.coordinates !== undefined && 
          typeof wp.coordinates.lat === 'number' && 
          typeof wp.coordinates.lon === 'number'
        )
        .map(wp => ({
          location: new google.maps.LatLng(wp.coordinates.lat, wp.coordinates.lon),
          stopover: true
        }));

      const request: google.maps.DirectionsRequest = {
        origin: route.start,
        destination: route.end,
        waypoints,
        optimizeWaypoints: false,
        travelMode: google.maps.TravelMode.DRIVING,
      };

      try {
        const result = await directionsService.route(request);
        if (result.routes.length > 0) {
          directionsRendererRef.current.setDirections(result);

          const bounds = new google.maps.LatLngBounds();
          result.routes[0].legs.forEach(leg => {
            leg.steps.forEach(step => {
              step.path.forEach(latlng => {
                bounds.extend(latlng);
              });
            });
          });

          if(mapRef.current) {
              mapRef.current.fitBounds(bounds);

              const startMarker = new google.maps.Marker({
                position: result.routes[0].legs[0].start_location,
                map: mapRef.current,
                title: 'Start',
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#4CAF50',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2
                }
              });
              markersRef.current.push(startMarker);

              activeWaypoints.forEach((wp, index) => {
                if (!wp.coordinates) return;
                const waypointMarker = new google.maps.Marker({
                  position: new google.maps.LatLng(wp.coordinates.lat, wp.coordinates.lon),
                  map: mapRef.current,
                  title: wp.location,
                  label: {
                    text: (index + 1).toString(),
                    color: '#FFFFFF'
                  },
                  icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#FF9800',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2
                  }
                });
                markersRef.current.push(waypointMarker);
              });

              const endMarker = new google.maps.Marker({
                position: result.routes[0].legs[result.routes[0].legs.length - 1].end_location,
                map: mapRef.current,
                title: 'End',
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: '#F44336',
                  fillOpacity: 1,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2
                }
              });
              markersRef.current.push(endMarker);
          }
        } else {
          console.error('Directions request failed: No routes found');
          directionsRendererRef.current.setDirections(null);
        }
      } catch (e) {
        console.error('Error calculating route:', e);
        if (directionsRendererRef.current) {
            directionsRendererRef.current.setDirections(null);
        }
      }
    };

    renderRoute();
  }, [activeWaypoints, route.start, route.end]);

  // --- Main App Logic & State ---

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
    if (selectedRouteIndex === null) return;
    
    setRouteOptions(prev => {
      const newOptions = [...prev];
      const waypoints = newOptions[selectedRouteIndex].waypoints;
      const wpIndex = waypoints.findIndex(wp => wp.id === id);
      if (wpIndex > -1) {
        waypoints[wpIndex].checked = !waypoints[wpIndex].checked;
      }
      return newOptions;
    });
  };
  
  const handleGenerateRoute = () => {
    if (!route.start || !route.end) {
      alert('Please enter both start and end locations');
      return;
    }

    const waypointsForUrl = [
        ...activeWaypoints.map(wp => wp.coordinates ? {lat: wp.coordinates.lat, lon: wp.coordinates.lon} : wp.location),
        ...route.waypoints.filter(wp => wp.location).map(wp => wp.location)
    ];

    const googleUrl = generateRouteURL(waypointsForUrl);
    setRouteUrl(googleUrl);

    const wazeDestination = route.waypoints.length > 0 ? route.waypoints[0].location : route.end;
    setWazeUrl(`https://waze.com/ul?q=${encodeURIComponent(wazeDestination)}&navigate=yes`);
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

  const generateWazeSegments = () => {
    const allWaypoints = [
        ...activeWaypoints.map(wp => wp.location),
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

  const checkedSuggestionsCount = activeWaypoints.length;

  // Create a ref for the map container div
  const mapContainerRef = useRef<HTMLDivElement>(null);

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
              <div className="location-controls">
                <div className="location-input-group">
                  <label htmlFor="start-location">Start Location</label>
                  <input
                    id="start-location"
                    type="text"
                    value={route.start}
                    onChange={(e) => setRoute(prev => ({ ...prev, start: e.target.value }))}
                    onBlur={handleSearch}
                    placeholder="Enter starting location"
                  />
                </div>

                <div className="location-input-group">
                  <label htmlFor="end-location">End Location</label>
                  <input
                    id="end-location"
                    type="text"
                    value={route.end}
                    onChange={(e) => setRoute(prev => ({ ...prev, end: e.target.value }))}
                    onBlur={handleSearch}
                    placeholder="Enter destination"
                  />
                </div>
              </div>

              {(routeOptions.length > 0 || isLoadingSuggestions) && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h3 className="text-lg font-medium text-blue-800 mb-3">
                    🎯 Suggested Route Options
                  </h3>
                  
                  {isLoadingSuggestions ? (
                    <div className="flex items-center space-x-3 py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <div className="text-blue-600 font-medium">Analyzing roads for maximum twistiness...</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {routeOptions.map((option, index) => (
                        <div 
                          key={index}
                          className={`route-option-card ${selectedRouteIndex === index ? 'selected' : ''}`}
                          onClick={() => setSelectedRouteIndex(index)}
                        >
                          <div className="font-bold text-lg">{option.name}</div>
                          <div className="text-sm">{option.waypoints.length} waypoints</div>
                        </div>
                      ))}
                      
                      {selectedRouteIndex !== null && (
                        <div className="waypoint-list">
                           <h4 className="text-md font-semibold text-gray-800 mt-4 mb-2">
                            Customize Waypoints for "{routeOptions[selectedRouteIndex].name}"
                          </h4>
                          {routeOptions[selectedRouteIndex].waypoints.map((suggestion) => (
                            <div key={suggestion.id} className="waypoint-item">
                              <div className="flex-1">
                                <div className="waypoint-location">{suggestion.location}</div>
                                <p className="waypoint-description">{suggestion.description}</p>
                              </div>
                               <span className="waypoint-score">
                                Twistiness: {Math.round(suggestion.twistiness || 0)}
                              </span>
                              <input 
                                type="checkbox"
                                checked={suggestion.checked}
                                onChange={() => toggleSuggestedWaypoint(suggestion.id)}
                                className="waypoint-checkbox"
                              />
                            </div>
                          ))}
                        </div>
                      )}
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
                </div>
              </div>

              <button
                onClick={handleGenerateRoute}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium mt-4"
                disabled={activeWaypoints.length === 0 && route.waypoints.length === 0}
              >
                Generate Scenic Route ({checkedSuggestionsCount + route.waypoints.filter(wp => wp.location).length} waypoints)
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
          suggestedWaypoints={activeWaypoints}
          onLoad={onMapLoad}
        />
      </div>
    </div>
  );
}

export default App;
