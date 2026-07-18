import React, { useMemo } from 'react';
import { Coordinates, RouteOption } from '../types';
import { buildRoutePreviewView } from './routePreviewGeometry';

interface RoutePreviewProps {
  route: RouteOption | null;
  start?: Coordinates | null;
  end?: Coordinates | null;
}

/**
 * SVG path preview used when Google Maps is unavailable (no API key).
 * Renders the selected route's graph geometry with start/end markers.
 */
const RoutePreview: React.FC<RoutePreviewProps> = ({ route, start, end }) => {
  const geometry = route?.pathGeometry;

  const view = useMemo(() => {
    const points: Coordinates[] = [];
    if (geometry && geometry.length > 0) points.push(...geometry);
    if (start) points.push(start);
    if (end) points.push(end);
    return buildRoutePreviewView(points);
  }, [geometry, start, end]);

  if (!view) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-100 p-8">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">🗺️</div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Route preview</h3>
          <p className="text-sm text-gray-600">
            Find scenic routes to see the selected path drawn here. Add a
            <code className="bg-gray-200 px-1 rounded mx-1">VITE_GOOGLE_MAPS_API_KEY</code>
            for the interactive Google map.
          </p>
        </div>
      </div>
    );
  }

  const { WIDTH, HEIGHT, project } = view;
  const pathPoints = (geometry || []).map(project);
  const pathD = pathPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const startPt = start ? project(start) : pathPoints[0];
  const endPt = end ? project(end) : pathPoints[pathPoints.length - 1];
  const waypointPts = (route?.waypoints || [])
    .filter(wp => wp.checked && wp.coordinates)
    .map(wp => ({ ...project(wp.coordinates!), label: wp.location }));

  return (
    <div className="relative h-full w-full bg-slate-50">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label={route ? `Preview of ${route.name}` : 'Route preview'}
      >
        <rect width={WIDTH} height={HEIGHT} fill="#f1f5f9" />
        {Array.from({ length: 8 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={(HEIGHT / 8) * i}
            x2={WIDTH}
            y2={(HEIGHT / 8) * i}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: 10 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={(WIDTH / 10) * i}
            y1={0}
            x2={(WIDTH / 10) * i}
            y2={HEIGHT}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}

        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="#e63946"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.9}
          />
        )}

        {waypointPts.map((wp, i) => (
          <g key={i}>
            <circle cx={wp.x} cy={wp.y} r={6} fill="#f97316" stroke="#fff" strokeWidth={2} />
            <text
              x={wp.x + 10}
              y={wp.y + 4}
              fontSize={11}
              fill="#475569"
              fontFamily="system-ui, sans-serif"
            >
              {i + 1}
            </text>
          </g>
        ))}

        {startPt && (
          <g>
            <circle cx={startPt.x} cy={startPt.y} r={9} fill="#2a9d8f" stroke="#fff" strokeWidth={2} />
            <text x={startPt.x + 14} y={startPt.y + 5} fontSize={14} fill="#2a9d8f" fontFamily="system-ui, sans-serif" fontWeight={600}>
              START
            </text>
          </g>
        )}
        {endPt && (
          <g>
            <circle cx={endPt.x} cy={endPt.y} r={9} fill="#264653" stroke="#fff" strokeWidth={2} />
            <text x={endPt.x + 14} y={endPt.y + 5} fontSize={14} fill="#264653" fontFamily="system-ui, sans-serif" fontWeight={600}>
              END
            </text>
          </g>
        )}
      </svg>

      {route && (
        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-md px-3 py-2 shadow-sm max-w-sm">
          <div className="font-semibold text-sm text-slate-800">{route.name}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {route.distance !== undefined && `${route.distance.toFixed(0)} km`}
            {route.duration !== undefined && ` · ${formatDuration(route.duration)}`}
            {route.totalTwistiness !== undefined && ` · twistiness ${route.totalTwistiness.toFixed(1)}`}
          </div>
        </div>
      )}
    </div>
  );
};

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default RoutePreview;
