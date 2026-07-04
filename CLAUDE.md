# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Canyon Tour is a web application that helps users plan and share scenic canyon drives through QR codes that link to Google Maps navigation. The app specializes in finding twisty, scenic routes by analyzing OpenStreetMap (OSM) road data and generating optimized waypoint routes.

## Development Commands

All development commands should be run from the `canyon-tour/` directory:

```bash
cd canyon-tour
```

### Core Commands
- `npm start` / `npm run dev` - Start Vite dev server (http://localhost:3000)
- `npm test` - Run tests once (Vitest); `npm run test:watch` for watch mode
- `npm run lint` - ESLint (flat config, typescript-eslint + react-hooks)
- `npm run build` - Typecheck (tsc) + production build (Vite, outputs `dist/`)
- `npm run preview` - Serve the production build locally
- `npm run demo` - Run the graph routing engine against live Overpass data (no Google key needed)
- `npm install` - Install dependencies

### Environment Setup
- Google Maps API key in `.env` as `VITE_GOOGLE_MAPS_API_KEY` (see `.env.example`) enables the map preview and Google Directions
- **Keyless mode**: without a key the app still works end-to-end — geocoding falls back to OSM Nominatim, distance/duration are estimated from the road graph, and the Google Maps share URL + QR code are fully functional; only the map preview is unavailable
- No backend required - runs entirely in browser
- **Optional**: Set `VITE_VERBOSE_LOGGING=true` in `.env.local` to enable detailed debug logging
- Env access is centralized in `src/utils/env.ts` (Vite `import.meta.env`)

## Architecture Overview

### Core Technology Stack
- **Frontend**: React 19 with TypeScript 5, Tailwind CSS v4
- **Build**: Vite 8 (dev server, production build), Vitest (tests)
- **Maps**: Google Maps API for directions and visualization
- **Data Processing**: Custom OSM integration for road analysis
- **QR Generation**: qrcode.react for sharing routes

### UI Components (`src/components/`)
- `RouteForm.tsx` - start/end inputs + search button
- `RouteOptionsPanel.tsx` - route option cards (name, distance, duration) + waypoint checkboxes
- `CustomWaypoints.tsx` - user-added waypoint management
- `PreferencesPanel.tsx` - avoid highways/tolls toggles
- `SharePanel.tsx` - Google Maps/Waze links + QR code + copy link + GPX download + save button
- `SavedRoutesPanel.tsx` - localStorage-persisted routes (load/rename/delete)
- `App.tsx` - state owner, status banner, and map rendering orchestration

### Key Architectural Components

#### 1. Graph-Based Routing System (`src/utils/routing/`)
The app's main feature is a topology-based routing engine over OSM data:

- **`roadGraph.ts`** - Builds a road graph from raw Overpass data. Ways are
  split into edges at shared junction nodes (topology, not street names).
  Hard exclusions (unpaved, <2 lanes, tracks, private access) never enter
  the graph. Each edge carries geometry, length, twistiness, and OSM tags.
- **`graphRouter.ts`** - Dijkstra shortest-cost path with per-profile edge
  costs: desirable edges (twisty, secondary, 2-lane, 45-65 mph) cost less
  than their physical length; undesirable ones cost more. Because Dijkstra
  never revisits a node, retracing steps is impossible by construction.
- **`graphRouteGenerator.ts`** - Orchestrator: builds the graph, runs the
  route profiles (plus an edge-penalized alternative), emits evenly spaced
  pin waypoints along each chosen path so Google Maps follows the selected
  roads, and fetches real directions per option.
- **`geoUtils.ts`** - Geographic calculations and utilities
- **`routeAnalysis.ts`** - Validates Google-returned geometry for
  out-and-back patterns (Google can still deviate between pins)

#### 2. OSM Integration (`src/services/osm/`)
Custom OpenStreetMap data fetching:

- **`osmClient.ts`** - Overpass API client (paved drivable road classes,
  selected by OSM metadata only — no street-name filters)
- **`twistinessCalculator.ts`** - Calculates road curvature/twistiness from
  node geometry
- **`roadSuitability.ts`** - Hard exclusions and soft penalties from OSM tags
- **`index.ts`** - `fetchOsmRoadData` entry point returning raw OSM data

#### 3. Route Profiles (`graphRouter.ts`)
Route diversity comes from cost profiles, not waypoint heuristics:

- **Twisty Explorer**: strong cost discounts for curvy 2-lane secondary
  roads; accepts long detours
- **Balanced Scenic**: moderate scenic preference with a smaller detour budget
- **Most Direct**: shortest allowed path (still avoids unpaved/narrow roads)
- **Twisty Explorer (Alternative)**: re-route with the primary scenic route's
  edges penalized, kept only if it is meaningfully different (<70% overlap)

#### 4. Road Filtering Logic (from `.cursor/rules/routing.mdc`)
**Prioritize:**
- 2 lane roads
- "secondary" roads
- Roads with speed limit 45-65mph
- Contiguous routing

**De-prioritize:**
- Roads that are not twisty

**Exclude:**
- Unpaved roads
- Roads less than 2 lanes
- Any waypoint causing retracing steps (out-and-back)

### Data Flow

1. User enters start/end locations
2. App geocodes locations using Google Maps
3. `fetchOsmRoadData` pulls raw road ways + node geometry for the corridor
4. `buildRoadGraph` turns the OSM data into a topology graph
5. `generateScenicRouteOptions` runs each cost profile over the graph and
   emits pin waypoints along the winning paths
6. Google Maps provides actual directions for each route option
7. User selects preferred route and can toggle waypoints
8. QR code generated for easy mobile sharing

### Key Types (`src/types.ts`)

```typescript
interface SuggestedWaypoint {
  id: string;
  location: string;
  description: string;
  coordinates?: { lat: number; lon: number };
  twistiness?: number;
  strategicValue?: number;
  routingPurpose?: 'twisty_routing' | 'elevation_forcing' | 'scenic_bypass' | 'canyon_access';
  // ... additional metadata
}

interface RouteOption {
  name: string;
  waypoints: SuggestedWaypoint[];
  strategy?: string;
  distance?: number;
  duration?: number;
  directions?: google.maps.DirectionsResult;
}
```

## Testing

- Run tests with `npm test` (CI mode: `CI=true npm test -- --watchAll=false`)
- Routing engine tests: `src/utils/routing/roadGraph.test.ts` and
  `src/utils/routing/graphRouteGenerator.test.ts`
- Offline OSM fixture: `src/services/osm/__fixtures__/lyons_valley.json`
  (real Overpass response for the Lyons Valley Road corridor)
- Synthetic two-road network helper: `src/testUtils/syntheticOsm.ts`
- Google Directions is mocked via `src/testUtils/mockDirections.ts`, which
  builds a geometry-faithful `DirectionsResult`
- Geocoding tests: `src/services/__tests__/googleMapsService.test.ts`
- Main App component test in `src/App.test.tsx`
- All routing is deterministic: same inputs always produce the same routes

## Code Conventions

- TypeScript strict mode enabled
- Functional components with hooks
- Detailed logging in development mode for route generation debugging
- Comprehensive error handling for external API calls

## Important Implementation Notes

### Route Generation Quality Controls
- Maximum 10 pin waypoints per route (Google Maps limit headroom); one pin
  per ~6 km of path keeps Google glued to the selected roads
- Pins are never placed within 1.5 km of start/end (Google handles approach)
- Endpoints snap per connected component (minimizing combined snap distance)
  so a nearby disconnected road island can never break routing
- Start/end must snap to the road graph within 30 km or generation aborts
- Route options that overlap >95% with an existing option are deduplicated

### Determinism
- No randomness anywhere in routing: identical inputs give identical routes,
  which makes tuning, debugging, and regression testing possible

### Name-Free Logic Rule
- Routing decisions use only OSM metadata (highway class, lanes, maxspeed,
  surface, access, geometry). Street names appear only in UI labels.

## External Dependencies

### Critical APIs
- **Google Maps Platform**: Directions, Geocoding, Maps JavaScript API
- **OpenStreetMap Overpass API**: Road geometry and metadata
- **Geolib**: Geographic calculations and utilities

### UI Libraries
- **QRCode.react**: QR code generation

## Development Tips

1. **Debugging Routes**: Enable development mode logging to see detailed route generation process
2. **Tuning**: Adjust profile multipliers in `ROUTE_PROFILES` (`graphRouter.ts`); scoring is deterministic so before/after comparisons are meaningful
3. **OSM Data**: Road characteristics come from OSM tags - check `roadSuitability.ts` for filtering logic
4. **Google Maps Integration**: Directions API results include full route geometry and metadata
5. **Offline testing**: Use the Lyons Valley fixture and `syntheticOsm.ts` to test routing without network access
6. **Live engine demo (no Google key needed)**: `npx tsx scripts/demoGraphRoute.ts out.svg` fetches real Overpass data for the Jamul→Descanso corridor, prints the roads each profile chooses, and renders an SVG route map

## Documentation Files

The repository includes extensive documentation:
- `ARCHITECTURE.md` - Detailed system architecture
- `requirements.md` - Original project requirements
- `SCENIC_ROUTING.md` - Scenic routing implementation details
- `ADVANCED_WAYPOINT_SYSTEM.md` - Waypoint system documentation
- `algorithm_improvements.md` - Algorithm improvement notes