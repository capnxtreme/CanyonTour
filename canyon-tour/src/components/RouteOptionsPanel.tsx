import React from 'react';
import { RouteOption } from '../types';

interface RouteOptionsPanelProps {
  routeOptions: RouteOption[];
  selectedRouteIndex: number | null;
  isLoading: boolean;
  loadingStatus?: string | null;
  onSelectRoute: (index: number) => void;
  onToggleWaypoint: (id: string) => void;
}

const RouteOptionsPanel: React.FC<RouteOptionsPanelProps> = ({
  routeOptions,
  selectedRouteIndex,
  isLoading,
  loadingStatus,
  onSelectRoute,
  onToggleWaypoint,
}) => {
  if (routeOptions.length === 0 && !isLoading) {
    return null;
  }

  const selectedRoute = selectedRouteIndex !== null ? routeOptions[selectedRouteIndex] : null;

  return (
    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
      <h3 className="text-lg font-medium text-blue-800 mb-3">
        🎯 Suggested Route Options
      </h3>

      {isLoading ? (
        <div className="flex items-center space-x-3 py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <div className="text-blue-600 font-medium">
            {loadingStatus || 'Analyzing roads for maximum twistiness...'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {routeOptions.map((option, index) => (
            <div
              key={option.name}
              className={`route-option-card ${selectedRouteIndex === index ? 'selected' : ''}`}
              onClick={() => onSelectRoute(index)}
            >
              <div className="font-bold text-lg">{option.name}</div>
              <div className="text-sm">
                {option.waypoints.length} waypoints
                {option.distance !== undefined && ` · ${option.distance.toFixed(0)} km`}
                {option.duration !== undefined && ` · ${formatDuration(option.duration)}`}
              </div>
              {option.description && (
                <div className="text-xs text-gray-600 mt-1">{option.description}</div>
              )}
            </div>
          ))}

          {selectedRoute && (
            <div className="waypoint-list">
              <h4 className="text-md font-semibold text-gray-800 mt-4 mb-2">
                Customize Waypoints for "{selectedRoute.name}"
              </h4>
              {selectedRoute.waypoints.map((suggestion) => (
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
                    onChange={() => onToggleWaypoint(suggestion.id)}
                    className="waypoint-checkbox"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default RouteOptionsPanel;
