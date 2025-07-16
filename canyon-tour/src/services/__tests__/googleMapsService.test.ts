import { geocodeLocation } from '../googleMapsService';

// Mock environment variable
process.env.REACT_APP_GOOGLE_MAPS_API_KEY = 'test-key';

// Mock fetch
global.fetch = jest.fn();

describe('googleMapsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('geocodeLocation', () => {
    it('should successfully geocode a valid location', async () => {
      const mockResponse = {
        status: 'OK',
        results: [{
          geometry: {
            location: {
              lat: 32.7034289,
              lng: -116.8686038
            }
          }
        }]
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await geocodeLocation('jamul casino');
      
      expect(result).toEqual({
        lat: 32.7034289,
        lon: -116.8686038
      });
    });

    it('should handle ZERO_RESULTS gracefully', async () => {
      const mockResponse = {
        status: 'ZERO_RESULTS',
        results: []
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await geocodeLocation('invalid location');
      
      expect(result).toBeNull();
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await geocodeLocation('jamul casino');
      
      expect(result).toBeNull();
    });

    it('should handle missing API key', async () => {
      const originalKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
      delete process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

      const result = await geocodeLocation('jamul casino');
      
      expect(result).toBeNull();

      // Restore API key
      process.env.REACT_APP_GOOGLE_MAPS_API_KEY = originalKey;
    });
  });
});