# Geocoding Stability Documentation

## Critical Issue
The geocoding service for "julian cafe" keeps breaking during development. This document establishes protocols to prevent this.

## Known Working State
- "jamul casino" → Works consistently ✅
- "julian cafe" → **FAILS** - Google API returns ZERO_RESULTS (not our bug!)
- "Julian, CA" → Works consistently ✅
- "Julian California" → Works consistently ✅

## Root Cause Analysis (December 21, 2025)
The "julian cafe" failure is NOT a bug in our code. Google's Geocoding API genuinely returns ZERO_RESULTS for this search term because there's no specific business with that exact name that Google can find.

**Solution**: Use "Julian, CA" instead of "julian cafe" for testing.

## Debugging Protocol

### 1. Test Geocoding Independently
Before making any changes to the app, test geocoding directly:

```bash
# Test the API key directly
curl -s "https://maps.googleapis.com/maps/api/geocode/json?address=julian%20cafe&key=$REACT_APP_GOOGLE_MAPS_API_KEY"

# Should return results, not ZERO_RESULTS
```

### 2. Fallback Test Locations
If "julian cafe" fails, these should work as alternatives for testing:
- "Julian, CA"
- "Julian California"
- "2224 Main St, Julian, CA"

### 3. Code Change Protocol
Before committing ANY changes that touch geocoding:

1. Test the current working state
2. Make incremental changes
3. Test after each change
4. If geocoding breaks, immediately revert the last change

## Files That Affect Geocoding
- `src/services/googleMapsService.ts` - Primary geocoding service
- `src/services/osm/osmClient.ts` - May affect bounding box calculation
- `.env` and `.env.local` - API key configuration

## Common Breaking Changes
- Adding verbose logging that interferes with async operations
- Modifying the geocoding request format
- Changing environment variable handling
- Adding debug logging that affects promise chains

## Recovery Steps
If geocoding breaks:

1. Check git status: `git status`
2. Revert recent changes: `git checkout -- src/services/googleMapsService.ts`
3. Test geocoding again
4. If still broken, revert more files
5. Document what caused the break

## Test Cases to Add
- Unit tests for geocoding service
- Integration tests for the full routing pipeline
- Automated tests that run on file changes

## Never Do This
- Don't add console.log statements inside async functions without testing
- Don't modify the fetch request format without testing
- Don't change environment variable handling without testing
- Don't commit changes that break basic geocoding functionality