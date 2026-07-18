import React from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { getGoogleMapsApiKey } from './utils/env';
import RoutePreview from './components/RoutePreview';
import { Coordinates, RouteOption } from './types';

interface MapProps {
  onLoad: (map: google.maps.Map) => void;
  selectedRoute?: RouteOption | null;
  startCoords?: Coordinates | null;
  endCoords?: Coordinates | null;
}

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 32.7157,  // San Diego
  lng: -117.1611
};

const InteractiveMap: React.FC<MapProps> = ({ onLoad, selectedRoute = null, startCoords = null, endCoords = null }) => {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey) {
    return <RoutePreview route={selectedRoute} start={startCoords} end={endCoords} />;
  }

  return <LoadedMap apiKey={apiKey} onLoad={onLoad} />;
};

const LoadedMap: React.FC<{ apiKey: string; onLoad: (map: google.maps.Map) => void }> = ({ apiKey, onLoad }) => {
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
