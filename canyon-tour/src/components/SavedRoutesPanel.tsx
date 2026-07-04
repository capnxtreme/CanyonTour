import React, { useState } from 'react';
import { SavedRoute } from '../utils/savedRoutes';

interface SavedRoutesPanelProps {
  savedRoutes: SavedRoute[];
  onLoad: (route: SavedRoute) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

const SavedRoutesPanel: React.FC<SavedRoutesPanelProps> = ({ savedRoutes, onLoad, onRename, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  if (savedRoutes.length === 0) return null;

  const startEditing = (route: SavedRoute) => {
    setEditingId(route.id);
    setEditingName(route.name);
  };

  const commitEditing = () => {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName);
    }
    setEditingId(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h2 className="text-2xl font-semibold mb-4">💾 Saved Routes</h2>
      <div className="space-y-2">
        {savedRoutes.map(route => (
          <div key={route.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="flex-1 min-w-0">
              {editingId === route.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={commitEditing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEditing();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                  className="w-full px-2 py-1 border border-blue-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="font-medium text-gray-800 truncate">{route.name}</div>
              )}
              <div className="text-xs text-gray-500 truncate">
                {route.start} → {route.end} · {route.waypointLocations.length} waypoints ·{' '}
                {new Date(route.savedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center space-x-2 ml-3">
              <button
                onClick={() => startEditing(route)}
                title="Rename"
                className="px-2 py-1 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors"
              >
                ✏️
              </button>
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
