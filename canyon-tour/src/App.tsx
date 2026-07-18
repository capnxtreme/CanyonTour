import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import './App.css';
import InteractiveMap from './InteractiveMap';
import RouteForm from './components/RouteForm';
import RouteOptionsPanel from './components/RouteOptionsPanel';
import CustomWaypoints from './components/CustomWaypoints';
import PreferencesPanel from './components/PreferencesPanel';
import SharePanel, { WazeSegment } from './components/SharePanel';
import SavedRoutesPanel from './components/SavedRoutesPanel';
import { Route, RoutePreferences, RouteOption, Coordinates } from './types';
import { geocodeLocation } from './services/googleMapsService';
import { fetchOsmRoadData } from './services/osm';
import { generateScenicRouteOptions } from './utils/routingUtils';
import { Logger } from './utils/logger';
import { SavedRoute, getSavedRoutes, saveRoute, deleteSavedRoute, renameSavedRoute } from './utils/savedRoutes';
import type { LocationSuggestion } from './components/LocationAutocomplete';

interface StatusMessage {
  type: 'error' | 'info' | 'success';
  text: string;
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
    avoidTolls: true
  });
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [startCoords, setStartCoords] = useState<Coordinates | null>(null);
  const [endCoords, setEndCoords] = useState<Coordinates | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>(() => getSavedRoutes());
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

  const handleSearch = async () => {
    if (!route.start || !route.end || isLoadingSuggestions) {
      return;
    }

    setIsLoadingSuggestions(true);
    setLoadingStatus('Geocoding…');
    setRouteOptions([]);
    setSelectedRouteIndex(null);
    setStatusMessage(null);
    Logger.info(`Finding scenic routes: "${route.start}" → "${route.end}"`);
    Logger.time('Route Discovery');

    try {
      // Reuse coords from autocomplete when available; otherwise geocode the text.
      let resolvedStart = startCoords;
      let resolvedEnd = endCoords;

      if (!resolvedStart) {
        resolvedStart = await geocodeLocation(route.start);
      }
      if (!resolvedStart) {
        setStatusMessage({ type: 'error', text: `Couldn't find "${route.start}". Try a more specific address or add a city/state.` });
        return;
      }

      if (!resolvedEnd) {
        resolvedEnd = await geocodeLocation(route.end);
      }
      if (!resolvedEnd) {
        setStatusMessage({ type: 'error', text: `Couldn't find "${route.end}". Try a more specific address or add a city/state.` });
        return;
      }

      setStartCoords(resolvedStart);
      setEndCoords(resolvedEnd);

      setLoadingStatus('Fetching roads…');
      const roadData = await fetchOsmRoadData(resolvedStart, resolvedEnd);

      if (!roadData) {
        setStatusMessage({ type: 'error', text: 'Could not load road data for this area. The OpenStreetMap service may be busy — try again in a minute.' });
      } else {
        setLoadingStatus('Building routes…');
        const options = await generateScenicRouteOptions(roadData, resolvedStart, resolvedEnd, {
          avoidHighways: preferences.avoidHighways,
          avoidTolls: preferences.avoidTolls
        });
        Logger.success(`Generated ${options.length} route options`);
        if (options.length === 0) {
          setStatusMessage({ type: 'error', text: 'No suitable scenic roads found between these locations. Try locations that are closer together or in a less urban area.' });
        } else {
          setRouteOptions(options);
          setSelectedRouteIndex(0);
        }
      }
    } catch (error) {
      Logger.error('Route discovery failed', error);
      setStatusMessage({ type: 'error', text: 'Something went wrong during route discovery. Check the browser console for details.' });
    } finally {
      Logger.timeEnd('Route Discovery');
      setIsLoadingSuggestions(false);
      setLoadingStatus(null);
    }
  };

  const selectedRoute = useMemo(() => {
    return selectedRouteIndex !== null ? routeOptions[selectedRouteIndex] : null;
  }, [selectedRouteIndex, routeOptions]);

  useEffect(() => {
    if (!directionsRendererRef.current) {
      return;
    }

    // Clear any existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // If there's a selected route with directions, render it
    if (selectedRoute && selectedRoute.directions) {
      directionsRendererRef.current.setDirections(selectedRoute.directions);

      // Add markers for the waypoints of the selected route
      selectedRoute.waypoints.forEach((wp, index) => {
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
    } else {
      // Otherwise, clear the directions from the map
      directionsRendererRef.current.setDirections(null);
    }
  }, [selectedRoute]);

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

    setRouteOptions(prev =>
      prev.map((option, index) => {
        if (index !== selectedRouteIndex) {
          return option;
        }
        return {
          ...option,
          waypoints: option.waypoints.map(wp =>
            wp.id === id ? { ...wp, checked: !wp.checked } : wp
          ),
        };
      })
    );
  };

  const handleGenerateRoute = () => {
    if (!route.start || !route.end) {
      return;
    }

    const waypointsForUrl = [
      ...(selectedRoute?.waypoints.filter(wp => wp.checked && wp.coordinates)
        .map(wp => ({ lat: wp.coordinates!.lat, lon: wp.coordinates!.lon })) || []),
      ...route.waypoints.filter(wp => wp.location).map(wp => wp.location)
    ];

    const googleUrl = generateRouteURL(waypointsForUrl);
    setRouteUrl(googleUrl);

    // Waze deep links only support a single destination; the multi-segment
    // list covers the intermediate waypoints.
    setWazeUrl(`https://waze.com/ul?q=${encodeURIComponent(route.end)}&navigate=yes`);
  };

  const generateRouteURL = (waypoints: (string | { lat: number, lon: number })[]) => {
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
  };

  const wazeSegments = useMemo<WazeSegment[]>(() => {
    const allWaypoints = [
      ...(selectedRoute?.waypoints.filter(wp => wp.checked && wp.location).map(wp => wp.location) || [])
    ];
    if (allWaypoints.length === 0) return [];

    const segments: WazeSegment[] = [];
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
  }, [selectedRoute, route.start, route.end]);

  const handleSaveRoute = () => {
    if (!routeUrl) return;
    const waypointLocations = [
      ...(selectedRoute?.waypoints.filter(wp => wp.checked).map(wp => wp.location) || []),
      ...route.waypoints.filter(wp => wp.location).map(wp => wp.location),
    ];
    const name = selectedRoute
      ? `${selectedRoute.name}: ${route.start.split(',')[0]} → ${route.end.split(',')[0]}`
      : `${route.start.split(',')[0]} → ${route.end.split(',')[0]}`;
    saveRoute({ name, start: route.start, end: route.end, waypointLocations, routeUrl, wazeUrl });
    setSavedRoutes(getSavedRoutes());
    setStatusMessage({ type: 'success', text: `Saved "${name}".` });
  };

  const handleLoadSavedRoute = (saved: SavedRoute) => {
    setRoute({ start: saved.start, end: saved.end, waypoints: [] });
    setStartCoords(null);
    setEndCoords(null);
    setRouteOptions([]);
    setSelectedRouteIndex(null);
    setRouteUrl(saved.routeUrl);
    setWazeUrl(saved.wazeUrl);
    setStatusMessage({ type: 'info', text: `Loaded "${saved.name}". Scan the QR code or press "Find Scenic Routes" to regenerate options.` });
  };

  const handleStartChange = (start: string) => {
    setRoute(prev => ({ ...prev, start }));
    setStartCoords(null);
  };

  const handleEndChange = (end: string) => {
    setRoute(prev => ({ ...prev, end }));
    setEndCoords(null);
  };

  const handleStartSelect = (suggestion: LocationSuggestion) => {
    setRoute(prev => ({ ...prev, start: suggestion.label }));
    setStartCoords({ lat: suggestion.lat, lon: suggestion.lon });
  };

  const handleEndSelect = (suggestion: LocationSuggestion) => {
    setRoute(prev => ({ ...prev, end: suggestion.label }));
    setEndCoords({ lat: suggestion.lat, lon: suggestion.lon });
  };

  const handleDeleteSavedRoute = (id: string) => {
    setSavedRoutes(deleteSavedRoute(id));
  };

  const handleRenameSavedRoute = (id: string, name: string) => {
    setSavedRoutes(renameSavedRoute(id, name));
  };

  const checkedSuggestionsCount = selectedRoute?.waypoints.filter(wp => wp.checked).length || 0;

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
              {statusMessage && (
                <div
                  role="alert"
                  className={`p-3 rounded-md border text-sm ${
                    statusMessage.type === 'error'
                      ? 'bg-red-50 border-red-300 text-red-800'
                      : statusMessage.type === 'success'
                        ? 'bg-green-50 border-green-300 text-green-800'
                        : 'bg-blue-50 border-blue-300 text-blue-800'
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}

              <RouteForm
                start={route.start}
                end={route.end}
                isLoading={isLoadingSuggestions}
                loadingStatus={loadingStatus}
                onStartChange={handleStartChange}
                onEndChange={handleEndChange}
                onStartSelect={handleStartSelect}
                onEndSelect={handleEndSelect}
                onSearch={handleSearch}
              />

              <RouteOptionsPanel
                routeOptions={routeOptions}
                selectedRouteIndex={selectedRouteIndex}
                isLoading={isLoadingSuggestions}
                loadingStatus={loadingStatus}
                onSelectRoute={setSelectedRouteIndex}
                onToggleWaypoint={toggleSuggestedWaypoint}
              />

              <CustomWaypoints
                waypoints={route.waypoints}
                onAdd={addWaypoint}
                onUpdate={updateWaypoint}
                onRemove={removeWaypoint}
              />

              <PreferencesPanel preferences={preferences} onChange={setPreferences} />

              <button
                onClick={handleGenerateRoute}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium mt-4"
                disabled={!route.start || !route.end}
              >
                Generate Scenic Route ({checkedSuggestionsCount + route.waypoints.filter(wp => wp.location).length} waypoints)
              </button>
            </div>
          </div>

          <SharePanel
            routeUrl={routeUrl}
            wazeUrl={wazeUrl}
            wazeSegments={wazeSegments}
            selectedRoute={selectedRoute}
            onSave={handleSaveRoute}
          />

          <SavedRoutesPanel
            savedRoutes={savedRoutes}
            onLoad={handleLoadSavedRoute}
            onRename={handleRenameSavedRoute}
            onDelete={handleDeleteSavedRoute}
          />
        </div>
      </div>
      <div className="map-container">
        <InteractiveMap
          onLoad={onMapLoad}
          selectedRoute={selectedRoute}
          startCoords={startCoords}
          endCoords={endCoords}
        />
      </div>
    </div>
  );
}

export default App;
