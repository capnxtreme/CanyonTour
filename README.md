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