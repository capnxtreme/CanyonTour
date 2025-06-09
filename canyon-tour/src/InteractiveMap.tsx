import React, { useRef, useEffect, useCallback } from 'react';
import { Route, SuggestedWaypoint } from './types';

interface MapProps {
  start: string;
  end: string;
  waypoints: { id: string; location: string }[];
  suggestedWaypoints: SuggestedWaypoint[];
  onLoad: (map: google.maps.Map) => void;
}

const InteractiveMap: React.FC<MapProps> = ({
  start,
  end,
  waypoints,
  suggestedWaypoints,
  onLoad,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);

  const initMap = useCallback(() => {
    if (googleMapRef.current) return;

    const mapOptions = {
      center: { lat: 34.0522, lng: -118.2437 },
      zoom: 8,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    };
    if (mapRef.current) {
      const map = new google.maps.Map(mapRef.current, mapOptions);
      googleMapRef.current = map;
      onLoad(map);
    }
  }, [onLoad]);

  useEffect(() => {
    if (window.google) {
      initMap();
    }
  }, [initMap]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

export default InteractiveMap; 