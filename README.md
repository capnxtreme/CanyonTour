# Canyon Tour

A web application that helps you plan and share scenic canyon drives with friends through QR codes that link to Google Maps navigation with waypoints.

## Features

- Plan routes with start, end, and waypoints
- Preview routes on an interactive map
- Generate QR codes for easy sharing
- Mobile-responsive design
- Direct Google Maps integration

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google Maps API key

## Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/canyon-tour.git
cd canyon-tour
```

2. Navigate to the project directory:
```bash
cd canyon-tour
```

3. Install dependencies:
```bash
npm install
```

4. Create a `.env` file in the `canyon-tour` directory and add your Google Maps API key:
```
REACT_APP_GOOGLE_MAPS_API_KEY=your_api_key_here
```

5. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:3000`.

## Project Structure

```
CanyonTour/
├── canyon-tour/          # Main React application
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── ...
├── requirements.md       # Project requirements
├── ARCHITECTURE.md       # System architecture
├── TODO.md              # Future enhancements
└── README.md           # This file
```

## Usage

1. Enter your start location
2. Enter your end location
3. Add waypoints along your route
4. Click "Generate Route" to preview the route on the map
5. Scan the generated QR code to open the route in Google Maps

## Development

Navigate to the `canyon-tour` directory first:
```bash
cd canyon-tour
```

Then run:
- `npm start` - Start development server
- `npm test` - Run tests
- `npm run build` - Build for production

## Technologies Used

- React.js with TypeScript
- Google Maps API
- QR Code Generation
- Tailwind CSS

## Documentation

- `requirements.md` - Project requirements and goals
- `ARCHITECTURE.md` - System architecture and design decisions
- `TODO.md` - Future features and enhancements
- `SCENIC_ROUTING.md` - Scenic routing implementation details
- `API_INTEGRATION.md` - API integration documentation

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 

## Roadmap: UX Improvements, Bug Fixes, and Feature Suggestions (2024)

### 1. User-Friendly Error Handling (High Priority)
- Implement a toast/alert system to display errors for:
  - Geocoding failures (invalid or unrecognized locations)
  - OSM/Google Maps API failures (network, quota, or missing API key)
  - No scenic waypoints found
- Ensure all errors are visible to the user, not just logged to the console.

### 2. Loading Indicators (High Priority)
- Add loading spinners for:
  - Map loading (initial and on error)
  - Geocoding in progress
  - Route generation/analysis
- Provide clear feedback for all async operations.

### 3. Input and Route Validation (High Priority)
- Validate start/end locations before route search (check existence via geocoding).
- Show user-friendly errors if locations are invalid or not found.
- Add route feasibility checks (e.g., minimum distance, valid waypoints).

### 4. Prevent Double Submissions (Medium Priority)
- Disable "Find Scenic Routes" and "Generate Scenic Route" buttons while requests are in progress.
- Prevent race conditions and duplicate API calls.

### 5. Route Preview and Analytics (Medium Priority)
- Display estimated drive time, distance, and elevation profile before final route generation.
- Show route summary and analytics (e.g., twistiness score, scenic value).

### 6. Interactive Map Editing (High Priority)
- Allow users to drag waypoints or route segments directly on the map.
- Provide visual feedback and undo/redo for route modifications.

### 7. Saved Routes and Sharing (Medium Priority)
- Allow users to save, edit, and categorize routes.
- Add sharing options: email, social media, export to GPX/KML.

### 8. POI and Advanced Preferences (Medium Priority)
- Integrate points of interest (POI) along the route (restaurants, gas stations, rest stops).
- Allow advanced preferences: elevation, time of day, weather, seasonal recommendations.

### 9. Offline Support and User Accounts (Low Priority)
- Cache routes for offline access.
- Add user authentication and cloud sync for saved routes.

### 10. Accessibility and Mobile UX (Ongoing)
- Ensure all controls are accessible (ARIA labels, keyboard navigation).
- Optimize for mobile devices and screen readers.

---

**Implementation will proceed in priority order, starting with error handling, loading indicators, and input validation. Each feature will include user stories, technical requirements, and test cases.** 