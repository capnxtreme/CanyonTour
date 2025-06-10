import React from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';

interface MapProps {
  onLoad: (map: google.maps.Map) => void;
}

const containerStyle = {
  width: '100%',
  height: '100vh'
};

const defaultCenter = {
  lat: 32.7157,  // San Diego
  lng: -117.1611
};

const InteractiveMap: React.FC<MapProps> = ({ onLoad }) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ''
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