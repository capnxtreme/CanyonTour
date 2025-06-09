export interface Coordinates {
    lat: number;
    lon: number;
  }
  
  export interface SuggestedWaypoint {
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
  
  export interface Route {
    start: string;
    end: string;
    waypoints: Waypoint[];
  }
  
  export interface Waypoint {
    id: string;
    location: string;
  }
  
  export interface RoutePreferences {
    avoidHighways: boolean;
    avoidTolls: boolean;
    favorScenicRoads: boolean;
  }
  
  export interface RouteOption {
    name: string;
    waypoints: SuggestedWaypoint[];
  } 