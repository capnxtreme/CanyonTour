import React, { useCallback, useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, DirectionsRenderer, Marker } from '@react-google-maps/api';

interface Waypoint {
  id: string;
  location: string;
}

interface SuggestedWaypoint {
  id: string;
  location: string;
  description: string;
  checked: boolean;
  type: string;
  coordinates?: { lat: number; lon: number };
}

interface InteractiveMapProps {
  start: string;
  end: string;
  waypoints: Waypoint[];
  suggestedWaypoints: SuggestedWaypoint[];
  onWaypointAdd: (location: string) => void;
  onWaypointUpdate: (id: string, location: string) => void;
  onWaypointRemove: (id: string) => void;
  onSuggestedWaypointToggle: (id: string) => void;
  preferences: {
    avoidHighways: boolean;
    avoidTolls: boolean;
    favorScenicRoads: boolean;
  };
}

const containerStyle = {
  width: '100%',
  height: '500px'
};

const defaultCenter = {
  lat: 37.7749,
  lng: -122.4194 // San Francisco
};

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  start,
  end,
  waypoints,
  suggestedWaypoints,
  onWaypointAdd,
  onWaypointUpdate,
  onWaypointRemove,
  onSuggestedWaypointToggle,
  preferences
}) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places']
  });

  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [mapCenter, ] = useState({ lat: 37.0902, lng: -95.7129 });

  useEffect(() => {
    if (isLoaded) {
      setDirectionsService(new window.google.maps.DirectionsService());
    }
  }, [isLoaded]);

  const calculateRoute = useCallback(async () => {
    if (!directionsService || !start || !end) {
      return;
    }

    try {
      // Build waypoints array from user waypoints and checked suggested waypoints
      const allWaypoints: google.maps.DirectionsWaypoint[] = [];
      
      // Add user-defined waypoints
      waypoints.forEach(wp => {
        if (wp.location.trim()) {
          allWaypoints.push({
            location: wp.location,
            stopover: true
          });
        }
      });

      // Add checked suggested waypoints
      suggestedWaypoints
        .filter(wp => wp.checked)
        .forEach(wp => {
          allWaypoints.push({
            location: wp.location,
            stopover: true
          });
        });

      const request: google.maps.DirectionsRequest = {
        origin: start,
        destination: end,
        waypoints: allWaypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
        avoidHighways: preferences.avoidHighways,
        avoidTolls: preferences.avoidTolls
      };

      const result = await directionsService.route(request);
      setDirectionsResponse(result);

      // Center map on the route (use current map reference, not from dependency)
      if (result.routes[0]?.bounds && map) {
        map.fitBounds(result.routes[0].bounds);
      }
    } catch (error) {
      console.error('Error calculating route:', error);
      setDirectionsResponse(null);
    }
  }, [directionsService, start, end, waypoints, suggestedWaypoints, preferences, map]);

  useEffect(() => {
    if (start && end) {
      calculateRoute();
    }
  }, [start, end, waypoints, suggestedWaypoints, preferences, calculateRoute]);

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Handle map clicks to add waypoints
  const onMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    if (!event.latLng || !map) return;

    const lat = event.latLng.lat();
    const lng = event.latLng.lng();
    
    // Use reverse geocoding to get a readable address
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { location: { lat, lng } },
      (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const address = results[0].formatted_address;
          onWaypointAdd(address);
        } else {
          // Fallback to coordinates if geocoding fails
          onWaypointAdd(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        }
      }
    );
  }, [onWaypointAdd, map]);

  // Handle directions changes (when user drags route)
  const onDirectionsChanged = useCallback(() => {
    if (!directionsResponse || !map) return;

    const route = directionsResponse.routes[0];
    if (!route) return;

    // Update waypoints based on the new route
    const newWaypoints: string[] = [];
    
    // Get waypoint locations from the optimized route
    route.waypoint_order?.forEach((index) => {
      const waypoint = route.legs[index];
      if (waypoint?.end_address) {
        newWaypoints.push(waypoint.end_address);
      }
    });

    // Update waypoints in parent component
    // Note: This is a simplified approach - in a real implementation,
    // you'd want to match existing waypoints and only update changed ones
    waypoints.forEach((wp, index) => {
      if (newWaypoints[index] && newWaypoints[index] !== wp.location) {
        onWaypointUpdate(wp.id, newWaypoints[index]);
      }
    });
  }, [directionsResponse, waypoints, onWaypointUpdate, map]);

  // Render suggested waypoint markers
  const renderSuggestedWaypoints = () => {
    return suggestedWaypoints
      .filter(wp => wp.coordinates && !wp.checked)
      .map(wp => (
        <Marker
          key={wp.id}
          position={{ lat: wp.coordinates!.lat, lng: wp.coordinates!.lon }}
          title={wp.description}
          icon={{
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="8" fill="#3B82F6" stroke="#1E40AF" stroke-width="2"/>
                <circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            `),
            scaledSize: new window.google.maps.Size(24, 24)
          }}
          onClick={() => onSuggestedWaypointToggle(wp.id)}
        />
      ));
  };

  if (!isLoaded) {
    return (
      <div className="w-full h-96 bg-gray-200 rounded-lg flex items-center justify-center">
        <div className="text-gray-600">Loading map...</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">Interactive Route Preview</h3>
        <div className="text-sm text-blue-700 space-y-1">
          <p>• Click anywhere on the map to add a waypoint</p>
          <p>• Drag the route line to modify the path</p>
          <p>• Click blue markers to add suggested scenic waypoints</p>
          <p>• The route automatically updates based on your preferences</p>
        </div>
      </div>
      
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={10}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={onMapClick}
        options={{
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
        }}
      >
        {directionsResponse && (
          <DirectionsRenderer
            directions={directionsResponse}
            options={{
              draggable: true,
              suppressMarkers: false,
            }}
            onDirectionsChanged={onDirectionsChanged}
          />
        )}
        
        {renderSuggestedWaypoints()}
      </GoogleMap>

      {directionsResponse && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg">
          <h4 className="font-semibold text-green-900 mb-2">Route Summary</h4>
          <div className="text-sm text-green-700">
            {directionsResponse.routes[0]?.legs.map((leg, index) => (
              <div key={index} className="mb-1">
                <span className="font-medium">Segment {index + 1}:</span> {leg.distance?.text} • {leg.duration?.text}
              </div>
            ))}
            <div className="mt-2 pt-2 border-t border-green-200">
              <span className="font-medium">Total:</span> {' '}
              {directionsResponse.routes[0]?.legs.reduce((total, leg) => total + (leg.distance?.value || 0), 0) / 1000} km • {' '}
              {directionsResponse.routes[0]?.legs.reduce((total, leg) => total + (leg.duration?.value || 0), 0) / 60} minutes
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveMap; 