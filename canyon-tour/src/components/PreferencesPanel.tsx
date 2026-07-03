import React from 'react';
import { RoutePreferences } from '../types';

interface PreferencesPanelProps {
  preferences: RoutePreferences;
  onChange: (preferences: RoutePreferences) => void;
}

const PreferencesPanel: React.FC<PreferencesPanelProps> = ({ preferences, onChange }) => (
  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
    <h3 className="text-lg font-medium text-green-800 mb-3">🌄 Advanced Scenic Routing</h3>
    <div className="space-y-3">
      <div className="flex items-center">
        <input
          type="checkbox"
          id="avoidHighways"
          checked={preferences.avoidHighways}
          onChange={(e) => onChange({ ...preferences, avoidHighways: e.target.checked })}
          className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
        />
        <label htmlFor="avoidHighways" className="ml-2 text-sm text-green-700">🚫 Avoid highways</label>
      </div>
      <div className="flex items-center">
        <input
          type="checkbox"
          id="avoidTolls"
          checked={preferences.avoidTolls}
          onChange={(e) => onChange({ ...preferences, avoidTolls: e.target.checked })}
          className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
        />
        <label htmlFor="avoidTolls" className="ml-2 text-sm text-green-700">💰 Avoid toll roads</label>
      </div>
    </div>
  </div>
);

export default PreferencesPanel;
