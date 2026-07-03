import { scoreWaypoint } from './strategyUtils';
import { SuggestedWaypoint, Coordinates } from '../../types';

describe('scoreWaypoint', () => {
  const start: Coordinates = { lat: 32.7, lon: -116.9 };
  const end: Coordinates = { lat: 32.85, lon: -116.6 };
  const baseDistance = 33000; // roughly the straight-line start->end distance in meters

  const makeWaypoint = (overrides: Partial<SuggestedWaypoint> = {}): SuggestedWaypoint => ({
    id: 'wp-1',
    location: 'Lyons Valley Road',
    description: 'Winding secondary road (Lyons Valley Road)',
    checked: true,
    type: 'strategic_routing',
    coordinates: { lat: 32.75, lon: -116.75 }, // between start and end
    twistiness: 2.5,
    strategicValue: 1.0,
    tags: {
      highway: 'secondary',
      lanes: '2',
      maxspeed: '55 mph',
      surface: 'asphalt',
      name: 'Lyons Valley Road',
    },
    ...overrides,
  });

  test('Valley Route scores a 2-lane secondary valley road highly (regression: shadowed finalScore bug)', () => {
    // Before the fix, a block-scoped `let finalScore` inside the Valley Route
    // case swallowed all bonuses and the strategy always scored ~0.
    const score = scoreWaypoint(makeWaypoint(), start, end, baseDistance, 'Valley Route');

    // Valley name (+40), 2 lanes (+35), secondary (+35), speed (+15),
    // named road (+10), twistiness (2.5 * 6), etc. — must be far above zero.
    expect(score).toBeGreaterThan(100);
  });

  test('Valley Route excludes unpaved roads entirely', () => {
    const score = scoreWaypoint(
      makeWaypoint({ tags: { highway: 'secondary', lanes: '2', surface: 'dirt' } }),
      start,
      end,
      baseDistance,
      'Valley Route'
    );
    expect(score).toBe(-Infinity);
  });

  test('Valley Route excludes roads with fewer than 2 lanes', () => {
    const score = scoreWaypoint(
      makeWaypoint({ tags: { highway: 'secondary', lanes: '1', surface: 'asphalt' } }),
      start,
      end,
      baseDistance,
      'Valley Route'
    );
    expect(score).toBe(-Infinity);
  });

  test('scenic strategies disqualify freeways', () => {
    const freeway = makeWaypoint({ tags: { highway: 'motorway', lanes: '4' } });
    for (const strategy of ['Twisty', 'Valley Route', 'Mountain Route', 'Scenic Loop', 'Adventure Route']) {
      expect(scoreWaypoint(freeway, start, end, baseDistance, strategy)).toBe(-Infinity);
    }
  });

  test('scoring is deterministic (regression: Math.random in scores)', () => {
    const waypoint = makeWaypoint();
    for (const strategy of ['Twisty', 'Balanced', 'Direct', 'Scenic Loop', 'Valley Route']) {
      const a = scoreWaypoint(waypoint, start, end, baseDistance, strategy);
      const b = scoreWaypoint(waypoint, start, end, baseDistance, strategy);
      expect(b).toBe(a);
    }
  });

  test('Twisty strategy prefers twistier roads, all else equal', () => {
    const straight = scoreWaypoint(makeWaypoint({ twistiness: 0.2 }), start, end, baseDistance, 'Twisty');
    const twisty = scoreWaypoint(makeWaypoint({ twistiness: 4.0 }), start, end, baseDistance, 'Twisty');
    expect(twisty).toBeGreaterThan(straight);
  });
});
