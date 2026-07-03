import { calculateDistance } from '../utils/routingUtils';

export const geocodeLocation = async (location: string): Promise<{ lat: number; lon: number } | null> => {
    console.log('1. Geocoding location with Google API:', location);
    try {
      const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('❌ FATAL: Google Maps API key not found. Please set REACT_APP_GOOGLE_MAPS_API_KEY.');
        return null;
      }

      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;

      const response = await fetch(url);

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
        console.log('  - ❌ Geocoding failed for:', location, 'Status:', data.status, 'Error:', data.error_message);
        return null;
      }
    } catch (error) {
      console.error('  - ❌ Geocoding error:', error);
      return null;
    }
  };

export const getEnhancedRouteBoundingBoxFromCoords = async (startCoords: { lat: number, lon: number }, endCoords: { lat: number, lon: number }): Promise<string | null> => {
  console.log('2. Calculating enhanced route bounding box from coordinates...');
  try {
      if (!startCoords || !endCoords) {
          console.error("  - ❌ Invalid start or end coordinates provided.");
          return null;
      };
      
      // calculateDistance returns meters; the buffer math below works in km.
      const directDistanceKm = calculateDistance(startCoords, endCoords) / 1000;
      console.log('  - Direct route distance:', directDistanceKm.toFixed(2), 'km');
      
      const buffer = Math.min(Math.max(directDistanceKm * 0.2, 5), 20); // 20% of distance, min 5km, max 20km
      console.log('  - Using buffer distance:', buffer.toFixed(2), 'km');
      
      const latBuffer = buffer / 111.32;
      const lonBuffer = buffer / (111.32 * Math.cos(startCoords.lat * Math.PI / 180));
      
      const minLat = Math.min(startCoords.lat, endCoords.lat) - latBuffer;
      const maxLat = Math.max(startCoords.lat, endCoords.lat) + latBuffer;
      const minLon = Math.min(startCoords.lon, endCoords.lon) - lonBuffer;
      const maxLon = Math.max(startCoords.lon, endCoords.lon) + lonBuffer;
      
      const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
      console.log('  - ✅ Calculated bounding box from coords:', bbox);
      return bbox;
  } catch (error) {
      console.log('  - ❌ Failed to get route bounding box from coords:', error);
      return null;
  }
};

export interface DirectionsOptions {
  avoidHighways?: boolean;
  avoidTolls?: boolean;
}

export const getDirections = async (
    start: { lat: number, lon: number },
    end: { lat: number, lon: number },
    waypoints: { lat: number, lon: number }[],
    options: DirectionsOptions = {}
  ): Promise<google.maps.DirectionsResult | null> => {
    console.log(`3. Fetching directions from Google with ${waypoints.length} waypoints...`);
    
    if (!window.google || !window.google.maps || !window.google.maps.DirectionsService) {
      console.error("  - ❌ Google Maps script not loaded or DirectionsService not available.");
      return null;
    }
  
    const directionsService = new window.google.maps.DirectionsService();
  
    const request: google.maps.DirectionsRequest = {
      origin: new window.google.maps.LatLng(start.lat, start.lon),
      destination: new window.google.maps.LatLng(end.lat, end.lon),
      waypoints: waypoints.map(wp => ({
        location: new window.google.maps.LatLng(wp.lat, wp.lon),
        stopover: true, // This is crucial to force the route through our waypoints
      })),
      optimizeWaypoints: false, // We have already optimized for scenery, not speed
      travelMode: window.google.maps.TravelMode.DRIVING,
      avoidHighways: !!options.avoidHighways,
      avoidTolls: !!options.avoidTolls,
    };
  
    try {
      const result = await directionsService.route(request);
      // The promise-based API call will throw an error on a non-OK status,
      // so if we get here, the status is OK.
      console.log('  - ✅ Successfully fetched directions.');
      return result;
    } catch (error) {
      console.error('  - ❌ Error fetching directions:', error);
      return null;
    }
  };

