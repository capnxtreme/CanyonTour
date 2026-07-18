import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LocationAutocomplete from './LocationAutocomplete';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          display_name: 'Jamul, San Diego County, California, USA',
          lat: '32.717',
          lon: '-116.876',
        },
        {
          display_name: 'Jamul Indian Village, California, USA',
          lat: '32.700',
          lon: '-116.850',
        },
      ],
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocationAutocomplete', () => {
  test('fetches and shows Nominatim suggestions after debounce', async () => {
    const onChange = vi.fn();

    const { rerender } = render(
      <LocationAutocomplete id="start" label="Start" value="" onChange={onChange} />
    );

    // Controlled input: parent would update value from onChange.
    rerender(
      <LocationAutocomplete id="start" label="Start" value="Jamul" onChange={onChange} />
    );

    await waitFor(
      () => {
        expect(fetch).toHaveBeenCalled();
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    expect(screen.getByText(/Jamul, San Diego County/)).toBeInTheDocument();
    expect(screen.getByText(/Jamul Indian Village/)).toBeInTheDocument();
  });

  test('selecting a suggestion calls onSelect with coords', async () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();

    const { rerender } = render(
      <LocationAutocomplete
        id="start"
        label="Start"
        value="Jamul"
        onChange={onChange}
        onSelect={onSelect}
      />
    );

    // Re-render to ensure effect sees value (same as mount with value).
    rerender(
      <LocationAutocomplete
        id="start"
        label="Start"
        value="Jamul"
        onChange={onChange}
        onSelect={onSelect}
      />
    );

    await waitFor(
      () => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    fireEvent.mouseDown(screen.getByText(/Jamul, San Diego County/));

    expect(onSelect).toHaveBeenCalledWith({
      label: 'Jamul, San Diego County, California, USA',
      lat: 32.717,
      lon: -116.876,
    });
    expect(onChange).toHaveBeenCalledWith('Jamul, San Diego County, California, USA');
  });
});
