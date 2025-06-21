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
- `npm start` - Start development server (http://localhost:3000)
- `npm test` - Run tests
- `npm run build` - Build for production
- `npm install` - Install dependencies

### Environment Setup
- Requires Google Maps API key in `.env` file as `REACT_APP_GOOGLE_MAPS_API_KEY`
- No backend required - runs entirely in browser

## Architecture Overview

### Core Technology Stack
- **Frontend**: React 19.1.0 with TypeScript, Tailwind CSS
- **Maps**: Google Maps API for directions and visualization
- **Data Processing**: Custom OSM integration for road analysis
- **QR Generation**: qrcode.react for sharing routes

### Key Architectural Components

#### 1. Routing System (`src/utils/routing/`)
The app's main feature is its sophisticated routing algorithm that finds scenic roads:

- **`routeGenerationUtils.ts`** - Main route generation orchestrator
- **`strategyUtils.ts`** - Routing strategies (Twisty, Valley Route, Mountain Route, etc.)
- **`waypointSelectionUtils.ts`** - Smart waypoint selection algorithms
- **`geoUtils.ts`** - Geographic calculations and utilities

#### 2. OSM Integration (`src/services/osm/`)
Custom OpenStreetMap data processing for finding scenic roads:

- **`osmClient.ts`** - OSM API interactions
- **`twistinessCalculator.ts`** - Calculates road curvature/twistiness
- **`roadSuitability.ts`** - Filters roads based on suitability criteria
- **`waypointProcessor.ts`** - Processes OSM data into waypoints

#### 3. Route Strategy System
The app uses multiple routing strategies to generate diverse route options:

- **Twisty**: Prioritizes maximum road curvature
- **Valley Route**: Focuses on valley roads and geographic features
- **Mountain Route**: Emphasizes elevation changes and mountain roads
- **Scenic Loop**: Creates circular scenic routes
- **Adventure Route**: Uses underutilized waypoints for exploration

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
3. OSM service finds potential waypoints in the area
4. Routing algorithms generate multiple route options using different strategies
5. Google Maps provides actual directions for each route
6. User selects preferred route and can customize waypoints
7. QR code generated for easy mobile sharing

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

- Tests are located in `src/utils/routingUtils.test.ts`
- Run tests with `npm test`
- Main App component test in `src/App.test.tsx`

## Code Conventions

- TypeScript strict mode enabled
- ES2015 target for broad browser compatibility
- Functional components with hooks
- Detailed logging in development mode for route generation debugging
- Comprehensive error handling for external API calls

## Important Implementation Notes

### Route Generation Quality Controls
- Minimum waypoint score threshold (12.0) to ensure quality routes
- Maximum 10 waypoints per route to avoid overwhelming Google Maps
- Routes automatically terminate when approaching destination (distance-based)
- Alternative routes generated only for high-scoring waypoint candidates

### Geographic Strategy Selection
The app automatically determines viable routing strategies based on available waypoints:
- Analyzes waypoint distribution and characteristics
- Filters waypoints by strategy-specific criteria
- Generates multiple route options with geographical diversity

### Performance Optimizations
- Concurrent route generation using Promise.all
- Cached directions results
- Efficient waypoint filtering before route generation
- Limited to 8 best routes to avoid UI overwhelming

## External Dependencies

### Critical APIs
- **Google Maps Platform**: Directions, Geocoding, Maps JavaScript API
- **OpenStreetMap Overpass API**: Road geometry and metadata
- **Geolib**: Geographic calculations and utilities

### UI Libraries
- **@headlessui/react**: Accessible UI components
- **@heroicons/react**: Icon library
- **QRCode.react**: QR code generation

## Development Tips

1. **Debugging Routes**: Enable development mode logging to see detailed route generation process
2. **Testing Waypoints**: Use console logs to understand waypoint scoring and selection
3. **OSM Data**: Road characteristics come from OSM tags - check `roadSuitability.ts` for filtering logic
4. **Google Maps Integration**: Directions API results include full route geometry and metadata
5. **Route Quality**: Routes are scored based on average twistiness, waypoint count, and strategic bonuses

## Documentation Files

The repository includes extensive documentation:
- `ARCHITECTURE.md` - Detailed system architecture
- `requirements.md` - Original project requirements
- `SCENIC_ROUTING.md` - Scenic routing implementation details
- `ADVANCED_WAYPOINT_SYSTEM.md` - Waypoint system documentation
- `algorithm_improvements.md` - Algorithm improvement notes