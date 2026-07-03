import { geocodeLocation } from '../googleMapsService';

// Mock fetch
global.fetch = vi.fn();

describe('googleMapsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
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

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await geocodeLocation('invalid location');
      
      expect(result).toBeNull();
    });

    it('should handle network errors', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

      const result = await geocodeLocation('jamul casino');
      
      expect(result).toBeNull();
    });

    it('should fall back to Nominatim when no API key is set', async () => {
      vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => [{ lat: '32.7171', lon: '-116.876' }]
      });

      const result = await geocodeLocation('Jamul, CA');

      expect(result).toEqual({ lat: 32.7171, lon: -116.876 });
      const requestedUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(requestedUrl).toContain('nominatim.openstreetmap.org');
      expect(requestedUrl).not.toContain('key=');
    });

    it('should return null when Nominatim finds nothing (no API key)', async () => {
      vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      const result = await geocodeLocation('nowhere at all xyz');

      expect(result).toBeNull();
    });
  });
});
