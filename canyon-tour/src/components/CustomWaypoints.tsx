import React from 'react';
import { Waypoint } from '../types';

interface CustomWaypointsProps {
  waypoints: Waypoint[];
  onAdd: () => void;
  onUpdate: (id: string, location: string) => void;
  onRemove: (id: string) => void;
}

const CustomWaypoints: React.FC<CustomWaypointsProps> = ({ waypoints, onAdd, onUpdate, onRemove }) => (
  <div>
    <div className="flex justify-between items-center mb-2">
      <label className="block text-sm font-medium text-gray-700">Additional Custom Waypoints</label>
      <button
        onClick={onAdd}
        className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
      >
        + Add Custom Waypoint
      </button>
    </div>

    {waypoints.map((waypoint, index) => (
      <div key={waypoint.id} className="flex items-center space-x-2 mb-2">
        <input
          type="text"
          value={waypoint.location}
          onChange={(e) => onUpdate(waypoint.id, e.target.value)}
          placeholder={`Custom waypoint ${index + 1}`}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => onRemove(waypoint.id)}
          className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
        >
          Remove
        </button>
      </div>
    ))}
  </div>
);

export default CustomWaypoints;
