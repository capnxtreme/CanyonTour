import React from 'react';
import LocationAutocomplete, { LocationSuggestion } from './LocationAutocomplete';

interface RouteFormProps {
  start: string;
  end: string;
  isLoading: boolean;
  loadingStatus?: string | null;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onStartSelect?: (suggestion: LocationSuggestion) => void;
  onEndSelect?: (suggestion: LocationSuggestion) => void;
  onSearch: () => void;
}

const RouteForm: React.FC<RouteFormProps> = ({
  start,
  end,
  isLoading,
  loadingStatus,
  onStartChange,
  onEndChange,
  onStartSelect,
  onEndSelect,
  onSearch,
}) => (
  <div className="location-controls">
    <LocationAutocomplete
      id="start-location"
      label="Start Location"
      value={start}
      disabled={isLoading}
      onChange={onStartChange}
      onSelect={onStartSelect}
      placeholder="Enter starting location"
    />

    <LocationAutocomplete
      id="end-location"
      label="End Location"
      value={end}
      disabled={isLoading}
      onChange={onEndChange}
      onSelect={onEndSelect}
      placeholder="Enter destination"
    />

    <button
      onClick={onSearch}
      className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
      disabled={!start || !end || isLoading}
    >
      {isLoading ? (loadingStatus || 'Finding Routes...') : 'Find Scenic Routes'}
    </button>
  </div>
);

export default RouteForm;
