import React from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { getGoogleMapsApiKey } from './utils/env';

interface MapProps {
  onLoad: (map: google.maps.Map) => void;
}

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 32.7157,  // San Diego
  lng: -117.1611
};

const MissingKeyNotice: React.FC = () => (
  <div className="flex items-center justify-center h-full bg-gray-100 p-8">
    <div className="max-w-md text-center">
      <div className="text-5xl mb-4">🗺️</div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">Map preview unavailable</h3>
      <p className="text-sm text-gray-600">
        Add <code className="bg-gray-200 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to your
        <code className="bg-gray-200 px-1 rounded ml-1">.env</code> file to display the interactive map.
        Route discovery, Google Maps links, and QR codes still work without it.
      </p>
    </div>
  </div>
);

const InteractiveMap: React.FC<MapProps> = ({ onLoad }) => {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    return <MissingKeyNotice />;
  }

  return <LoadedMap apiKey={apiKey} onLoad={onLoad} />;
};

const LoadedMap: React.FC<MapProps & { apiKey: string }> = ({ apiKey, onLoad }) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey
  });

  return isLoaded ? (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={defaultCenter}
      zoom={8}
      onLoad={onLoad}
      options={{
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      }}
    />
  ) : <div />;
};

export default InteractiveMap;
