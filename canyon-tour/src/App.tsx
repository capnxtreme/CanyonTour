import React, { useState } from 'react';
import './App.css';

interface Waypoint {
  id: string;
  location: string;
}

interface Route {
  start: string;
  end: string;
  waypoints: Waypoint[];
}

function App() {
  const [route, setRoute] = useState<Route>({
    start: '',
    end: '',
    waypoints: []
  });
  const [routeUrl, setRouteUrl] = useState<string>('');

  const addWaypoint = () => {
    const newWaypoint: Waypoint = {
      id: Date.now().toString(),
      location: ''
    };
    setRoute(prev => ({
      ...prev,
      waypoints: [...prev.waypoints, newWaypoint]
    }));
  };

  const updateWaypoint = (id: string, location: string) => {
    setRoute(prev => ({
      ...prev,
      waypoints: prev.waypoints.map(wp => 
        wp.id === id ? { ...wp, location } : wp
      )
    }));
  };

  const removeWaypoint = (id: string) => {
    setRoute(prev => ({
      ...prev,
      waypoints: prev.waypoints.filter(wp => wp.id !== id)
    }));
  };

  const generateRoute = () => {
    if (!route.start || !route.end) {
      alert('Please enter both start and end locations');
      return;
    }

    // Build Google Maps URL with waypoints
    const baseUrl = 'https://www.google.com/maps/dir/';
    const locations = [
      route.start,
      ...route.waypoints.filter(wp => wp.location).map(wp => wp.location),
      route.end
    ];
    
    const url = baseUrl + locations.map(loc => encodeURIComponent(loc)).join('/');
    setRouteUrl(url);
  };

  const generateQRCode = () => {
    if (!routeUrl) {
      alert('Please generate a route first');
      return;
    }
    
    // Simple QR code implementation - in a real app, you'd use a proper QR library
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(routeUrl)}`;
    window.open(qrUrl, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-8">
          🏔️ Canyon Tour
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Plan scenic canyon drives and share them with QR codes
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">Plan Your Route</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Location
              </label>
              <input
                type="text"
                value={route.start}
                onChange={(e) => setRoute(prev => ({ ...prev, start: e.target.value }))}
                placeholder="Enter starting location"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Location
              </label>
              <input
                type="text"
                value={route.end}
                onChange={(e) => setRoute(prev => ({ ...prev, end: e.target.value }))}
                placeholder="Enter destination"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Waypoints
                </label>
                <button
                  onClick={addWaypoint}
                  className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                >
                  + Add Waypoint
                </button>
              </div>
              
              {route.waypoints.map((waypoint, index) => (
                <div key={waypoint.id} className="flex items-center space-x-2 mb-2">
                  <input
                    type="text"
                    value={waypoint.location}
                    onChange={(e) => updateWaypoint(waypoint.id, e.target.value)}
                    placeholder={`Waypoint ${index + 1}`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => removeWaypoint(waypoint.id)}
                    className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={generateRoute}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Generate Route
            </button>
          </div>
        </div>

        {routeUrl && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4">Your Route</h2>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">Google Maps URL:</p>
              <div className="bg-gray-100 p-3 rounded-md">
                <a 
                  href={routeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 break-all"
                >
                  {routeUrl}
                </a>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => window.open(routeUrl, '_blank')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Open in Google Maps
              </button>
              
              <button
                onClick={generateQRCode}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
              >
                Generate QR Code
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
