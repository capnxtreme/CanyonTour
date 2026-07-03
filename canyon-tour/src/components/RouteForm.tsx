import React from 'react';

interface RouteFormProps {
  start: string;
  end: string;
  isLoading: boolean;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onSearch: () => void;
}

const RouteForm: React.FC<RouteFormProps> = ({
  start,
  end,
  isLoading,
  onStartChange,
  onEndChange,
  onSearch,
}) => (
  <div className="location-controls">
    <div className="location-input-group">
      <label htmlFor="start-location">Start Location</label>
      <input
        id="start-location"
        type="text"
        value={start}
        onChange={(e) => onStartChange(e.target.value)}
        placeholder="Enter starting location"
      />
    </div>

    <div className="location-input-group">
      <label htmlFor="end-location">End Location</label>
      <input
        id="end-location"
        type="text"
        value={end}
        onChange={(e) => onEndChange(e.target.value)}
        placeholder="Enter destination"
      />
    </div>

    <button
      onClick={onSearch}
      className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
      disabled={!start || !end || isLoading}
    >
      {isLoading ? 'Finding Routes...' : 'Find Scenic Routes'}
    </button>
  </div>
);

export default RouteForm;
