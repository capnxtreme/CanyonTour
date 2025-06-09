import { calculateDistance } from '../utils/routingUtils';

export const geocodeLocation = async (location: string): Promise<{ lat: number; lon: number } | null> => {
    console.log('1. Geocoding location with Google API:', location);
    try {
      const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('❌ FATAL: Google Maps API key not found. Please set REACT_APP_GOOGLE_MAPS_API_KEY.');
        return null;
      }
      console.log('  - API key found:', apiKey.substring(0, 10) + '...');
      
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
      console.log('  - Making request to:', url);
      
      const response = await fetch(url);
      console.log('  - Response status:', response.status);
      
      if (!response.ok) {
        console.error('  - ❌ Geocoding API request failed:', response.status, response.statusText);
        return null;
      }
      
      const data = await response.json();
      console.log('  - Geocoding response:', JSON.stringify(data, null, 2));
      
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

export const getEnhancedRouteBoundingBox = async (start: string, end: string): Promise<string | null> => {
console.log('2. Calculating enhanced route bounding box...');
try {
    const startCoords = await geocodeLocation(start);
    const endCoords = await geocodeLocation(end);
    if (!startCoords || !endCoords) {
    console.error("  - ❌ Couldn't get coordinates for start or end. Aborting.");
    return null;
    };
    
    // Calculate direct route distance
    const directDistance = calculateDistance(startCoords, endCoords);
    console.log('  - Direct route distance:', directDistance.toFixed(2), 'km');
    
    // Add buffer based on route distance (larger buffer for longer routes)
    const buffer = Math.min(Math.max(directDistance * 0.2, 5), 20); // 20% of distance, min 5km, max 20km
    console.log('  - Using buffer distance:', buffer.toFixed(2), 'km');
    
    // Convert buffer from km to degrees (approximate)
    const latBuffer = buffer / 111.32; // 1 degree of latitude ≈ 111.32 km
    const lonBuffer = buffer / (111.32 * Math.cos(startCoords.lat * Math.PI / 180));
    
    const minLat = Math.min(startCoords.lat, endCoords.lat) - latBuffer;
    const maxLat = Math.max(startCoords.lat, endCoords.lat) + latBuffer;
    const minLon = Math.min(startCoords.lon, endCoords.lon) - lonBuffer;
    const maxLon = Math.max(startCoords.lon, endCoords.lon) + lonBuffer;
    
    const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
    console.log('  - ✅ Calculated bounding box:', bbox);
    return bbox;
} catch (error) {
    console.log('  - ❌ Failed to get route bounding box:', error);
    return null;
}
};

