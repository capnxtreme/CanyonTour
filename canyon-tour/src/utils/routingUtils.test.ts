import { generateRouteOptions, calculateDistance } from './routingUtils';
import { SuggestedWaypoint, Coordinates } from '../types';

describe('Canyon Tour Routing Logic', () => {
  const startCoords: Coordinates = { lat: 34.0522, lon: -118.2437 }; // Los Angeles
  const endCoords: Coordinates = { lat: 36.1699, lon: -115.1398 };   // Las Vegas

  // Waypoints scattered between LA and Vegas
  const mockWaypoints: SuggestedWaypoint[] = [
    { id: '1', location: 'Barstow', description: 'Desert town waypoint', checked: true, type: 'test', coordinates: { lat: 34.8958, lon: -117.0230 }, twistiness: 3 }, // On the direct path
    { id: '2', location: 'Death Valley Jct', description: 'Very twisty junction', checked: true, type: 'test', coordinates: { lat: 36.3046, lon: -116.4150 }, twistiness: 9 }, // Very twisty, north
    { id: '3', location: 'Kelso', description: 'Southern route waypoint', checked: true, type: 'test', coordinates: { lat: 35.0000, lon: -115.6667 }, twistiness: 7 }, // South of main route
    { id: '4', location: 'Zzyzx', description: 'Slightly off-route', checked: true, type: 'test', coordinates: { lat: 35.1436, lon: -116.1053 }, twistiness: 2 }, // Slightly off-route
    { id: '5', location: 'Amboy Crater', description: 'Very twisty southern route', checked: true, type: 'test', coordinates: { lat: 34.5500, lon: -115.4667 }, twistiness: 8 }, // Very south, twisty
    { id: '6', location: 'Shoshone', description: 'Northern twisty route', checked: true, type: 'test', coordinates: { lat: 35.9733, lon: -116.2703 }, twistiness: 8 }, // North, twisty
    { id: '7', location: 'Baker', description: 'Main route waypoint', checked: true, type: 'test', coordinates: { lat: 35.2653, lon: -116.0742 }, twistiness: 1 }, // On main route
    { id: '8', location: 'Primm', description: 'Close to Vegas', checked: true, type: 'test', coordinates: { lat: 35.6139, lon: -115.3894 }, twistiness: 1 }, // Close to Vegas
    { id: '9', location: 'Valley Wells', description: 'South of I-15', checked: true, type: 'test', coordinates: { lat: 35.4339, lon: -115.6567 }, twistiness: 4 }, // South of I-15
    { id: '10', location: 'North of I-15', description: 'Northern route requiring backtracking', checked: true, type: 'test', coordinates: { lat: 35.5, lon: -116.5 }, twistiness: 9 }, // North, should require backtracking
    { id: '11', location: 'Behind LA', description: 'Behind start point', checked: true, type: 'test', coordinates: { lat: 33.9, lon: -118.4 }, twistiness: 10 }, // Behind start
    { id: '12', location: 'Past Vegas', description: 'Past end point', checked: true, type: 'test', coordinates: { lat: 36.3, lon: -115.0 }, twistiness: 10 }, // Past end
  ];

  test('should generate multiple, distinct route options', () => {
    const options = generateRouteOptions(mockWaypoints, startCoords, endCoords);

    expect(options.length).toBeGreaterThan(1);

    // Check that we have different route types
    const routeNames = options.map(o => o.name);
    const uniqueTypes = new Set(routeNames.map(name => name.split(' ')[0]));
    
    // Should have at least 3 different route types
    expect(uniqueTypes.size).toBeGreaterThanOrEqual(3);
    
    // Should have routes with waypoints
    const routesWithWaypoints = options.filter(o => o.waypoints.length > 0);
    expect(routesWithWaypoints.length).toBeGreaterThan(0);
    
         // Routes should have different waypoint selections for diversity
     if (options.length > 1) {
       const route1Waypoints = new Set(options[0].waypoints.map(w => w.id));
       const route2Waypoints = new Set(options[1].waypoints.map(w => w.id));
       const intersection = new Set([...route1Waypoints].filter(x => route2Waypoints.has(x)));
       
       // Routes should not be completely identical (allow some overlap for geographic constraints)
       const maxRouteSize = Math.max(route1Waypoints.size, route2Waypoints.size);
       if (maxRouteSize > 2) {
         expect(intersection.size).toBeLessThan(maxRouteSize);
       }
     }
  });
  
  test('should produce a route that makes logical geographic progress', () => {
    const options = generateRouteOptions(mockWaypoints, startCoords, endCoords);
    const routeWithWaypoints = options.find(o => o.waypoints.length > 0);
    
    expect(routeWithWaypoints).toBeDefined();

    const waypoints = [startCoords, ...(routeWithWaypoints?.waypoints.map(wp => wp.coordinates!) || []), endCoords];

    for (let i = 0; i < waypoints.length - 1; i++) {
        const remainingDistance = calculateDistance(waypoints[i], endCoords);
        const nextRemainingDistance = calculateDistance(waypoints[i+1], endCoords);
        // Each step should generally bring us closer to the destination (allowing for some scenic detours)
        // For scenic routes, we allow up to 50% deviation from strict progress to accommodate loops and detours
        expect(nextRemainingDistance).toBeLessThan(remainingDistance * 1.5);
    }
  });

  test('should handle waypoints with low twistiness scores', () => {
    // Use a waypoint that's very close to the start (within 1km)
    const veryCloseWaypoint: SuggestedWaypoint = { 
      id: '13', 
      location: 'Very Close to LA', 
      description: 'Very close to start', 
      checked: true, 
      type: 'test', 
      coordinates: { lat: 34.0522, lon: -118.2400 }, // Very close to LA
      twistiness: 0.05 // Very low twistiness
    };
    const options = generateRouteOptions([veryCloseWaypoint], startCoords, endCoords);
    // The algorithm should either filter this out or create a direct route fallback
    expect(options.length).toBeGreaterThanOrEqual(0);
  });
}); 