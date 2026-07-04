import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { RouteOption } from '../types';
import { routeToGpx, gpxFilename } from '../utils/gpxExport';

export interface WazeSegment {
  url: string;
  description: string;
  segment: number;
}

interface SharePanelProps {
  routeUrl: string;
  wazeUrl: string;
  wazeSegments: WazeSegment[];
  selectedRoute: RouteOption | null;
  onSave: () => void;
}

const SharePanel: React.FC<SharePanelProps> = ({ routeUrl, wazeUrl, wazeSegments, selectedRoute, onSave }) => {
  const [copied, setCopied] = useState(false);

  if (!routeUrl) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(routeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  const handleDownloadGpx = () => {
    if (!selectedRoute) return;
    const gpx = routeToGpx(selectedRoute);
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = gpxFilename(selectedRoute);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Your Twisty Canyon Route</h2>
        <button
          onClick={onSave}
          className="px-3 py-1 bg-amber-500 text-white text-sm rounded-md hover:bg-amber-600 transition-colors"
        >
          💾 Save Route
        </button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-medium text-gray-800">Google Maps Route</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700 transition-colors"
            >
              {copied ? '✓ Copied!' : '📋 Copy Link'}
            </button>
            {selectedRoute && (
              <button
                onClick={handleDownloadGpx}
                className="px-3 py-1 bg-teal-600 text-white text-sm rounded-md hover:bg-teal-700 transition-colors"
              >
                ⬇ Download GPX
              </button>
            )}
          </div>
        </div>
        <div className="bg-gray-100 p-3 rounded-md mb-3">
          <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 break-all text-sm">{routeUrl}</a>
        </div>
      </div>

      {wazeUrl && (
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-800">Waze Route</h3>
          <div className="bg-purple-50 p-3 rounded-md mb-3">
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:text-purple-800 break-all text-sm">{wazeUrl}</a>
          </div>

          {wazeSegments.length > 1 && (
            <div className="bg-purple-50 p-3 rounded-md">
              <div className="text-sm font-medium text-purple-800 mb-2">Multi-Segment Route</div>
              <div className="space-y-2">
                {wazeSegments.map((segment) => (
                  <div key={segment.segment} className="flex items-center justify-between bg-white p-2 rounded border">
                    <span className="text-xs font-medium text-gray-700">Segment {segment.segment}: {segment.description}</span>
                    <button
                      onClick={() => window.open(segment.url, '_blank')}
                      className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors ml-2"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Share Your Route</h3>
        <div className="flex items-center space-x-4">
          <div className="w-40 h-40 p-2 border rounded-md bg-white">
            <QRCodeSVG value={routeUrl} size={150} />
          </div>
          <p className="text-sm text-gray-600 flex-1">Scan this QR code with your phone to open the route directly in Google Maps.</p>
        </div>
      </div>
    </div>
  );
};

export default SharePanel;
