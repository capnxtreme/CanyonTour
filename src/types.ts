export interface SuggestedWaypoint {
  id: string;
  location: string;
  description: string;
  checked: boolean;
  type: string;
  coordinates?: { lat: number; lon: number };
  roadType?: string;
  twistiness?: number;
  elevation?: number;
  tags?: { [key: string]: any };
}

export interface Route {
  start: string;
  // ... existing code ...
} 