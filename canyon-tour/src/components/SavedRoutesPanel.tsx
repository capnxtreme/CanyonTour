import React from 'react';
import { SavedRoute } from '../utils/savedRoutes';

interface SavedRoutesPanelProps {
  savedRoutes: SavedRoute[];
  onLoad: (route: SavedRoute) => void;
  onDelete: (id: string) => void;
}

const SavedRoutesPanel: React.FC<SavedRoutesPanelProps> = ({ savedRoutes, onLoad, onDelete }) => {
  if (savedRoutes.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">💾 Saved Routes</h2>
      <div className="space-y-2">
        {savedRoutes.map(route => (
          <div key={route.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 truncate">{route.name}</div>
              <div className="text-xs text-gray-500 truncate">
                {route.start} → {route.end} · {route.waypointLocations.length} waypoints ·{' '}
                {new Date(route.savedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-3">
              <button
                onClick={() => onLoad(route)}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
              >
                Load
              </button>
              <button
                onClick={() => onDelete(route.id)}
                className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SavedRoutesPanel;
