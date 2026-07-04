# 🏔️ Canyon Tour

Plan and share twisty, scenic canyon drives. Canyon Tour analyzes OpenStreetMap
road data to find genuinely curvy 2-lane roads between two locations, builds
optimized routes, and produces a Google Maps link + QR code (and GPX file) so
you and your friends can navigate them.

## How it works

1. Enter a start and end location.
2. The app fetches raw road data for the corridor from the OpenStreetMap
   Overpass API and builds a **topology road graph** (ways split into edges at
   shared junction nodes — no street-name matching).
3. A cost-based shortest-path search runs per route profile: twisty,
   2-lane, secondary, 45–65 mph roads cost *less* than their physical length,
   so the optimal path naturally detours onto them. Unpaved and sub-2-lane
   roads never enter the graph. Retracing steps is impossible by construction.
4. Pin waypoints are emitted along the chosen path so Google Maps follows the
   selected roads.
5. Share the result as a Google Maps URL, QR code, Waze links, or a GPX file.

Route profiles: **Twisty Explorer** (max curves, generous detours),
**Balanced Scenic**, **Most Direct**, plus a meaningfully different
**Alternative** scenic route when one exists.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

### Google Maps API key (optional but recommended)

```bash
cp .env.example .env
# then edit .env:
# VITE_GOOGLE_MAPS_API_KEY=your-key
```

The key enables the interactive map preview and real Google Directions
distances/times. It needs the **Maps JavaScript API**, **Directions API**, and
**Geocoding API** enabled, and should be restricted (HTTP referrers + API
restrictions) since it ships in the browser bundle.

**Keyless mode**: without a key the app still works end-to-end — geocoding
falls back to OSM Nominatim, distance/duration are estimated from the road
graph, and the share URL, QR code, and GPX export are fully functional. Only
the map preview is unavailable.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | Vite dev server on port 3000 |
| `npm test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint |
| `npm run build` | Typecheck (tsc) + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run demo` | Run the routing engine against live Overpass data and render an SVG route map — no API key needed |

## Project structure

```
src/
  components/          UI components (form, options, share, saved routes)
  services/
    osm/               Overpass client, road suitability, twistiness calc
    googleMapsService  Geocoding (Google or Nominatim fallback) + Directions
  utils/
    routing/
      roadGraph.ts             OSM data -> topology road graph
      graphRouter.ts           cost profiles + Dijkstra path search
      graphRouteGenerator.ts   route options + pin waypoint emission
    gpxExport.ts       GPX 1.1 export of the selected route
    savedRoutes.ts     localStorage persistence
scripts/
  demoGraphRoute.ts    offline engine demo/debugging tool
```

## Routing rules

The road selection logic uses **OSM metadata only** (highway class, lanes,
maxspeed, surface, access, geometry) — never street names. See
`.cursor/rules/routing.mdc` and `CLAUDE.md` at the repository root for the
full rules and architecture documentation.

## Testing

Tests run offline and deterministically: a real Overpass response for the
Lyons Valley Road corridor is checked in as a fixture, a synthetic two-road
network exercises profile behavior, and Google Directions is mocked with a
geometry-faithful builder.

```bash
npm test
```
