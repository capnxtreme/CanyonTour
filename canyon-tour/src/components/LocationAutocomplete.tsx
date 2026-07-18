import React, { useEffect, useId, useRef, useState } from 'react';

export interface LocationSuggestion {
  label: string;
  lat: number;
  lon: number;
}

interface LocationAutocompleteProps {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSelect?: (suggestion: LocationSuggestion) => void;
}

/**
 * Debounced Nominatim search-as-you-type for start/end locations.
 * Works without a Google API key.
 */
const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  id,
  label,
  value,
  placeholder,
  disabled,
  onChange,
  onSelect,
}) => {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const skipSearchRef = useRef(false);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    const query = value.trim();
    const timer = window.setTimeout(async () => {
      if (query.length < 3 || disabled) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);

      try {
        const url =
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=5` +
          `&q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const results = await response.json();
        if (!Array.isArray(results)) {
          setSuggestions([]);
          return;
        }
        const mapped: LocationSuggestion[] = results.map((r: { display_name: string; lat: string; lon: string }) => ({
          label: r.display_name,
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
        }));
        // Nominatim sometimes returns near-identical hits; keep the first of each cluster.
        const seen = new Set<string>();
        const unique = mapped.filter(s => {
          const key = `${s.lat.toFixed(4)},${s.lon.toFixed(4)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSuggestions(unique);
        setOpen(unique.length > 0);
        setActiveIndex(-1);
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setSuggestions([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [value, disabled]);

  const choose = (suggestion: LocationSuggestion) => {
    skipSearchRef.current = true;
    onChange(suggestion.label);
    onSelect?.(suggestion);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      choose(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="location-input-group relative">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // Delay so a mousedown on a suggestion still registers.
          blurTimeoutRef.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
      {isSearching && (
        <div className="absolute right-3 top-9 text-xs text-gray-400">Searching…</div>
      )}
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.lat},${suggestion.lon},${index}`}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`px-3 py-2 text-sm cursor-pointer ${
                index === activeIndex ? 'bg-blue-50 text-blue-900' : 'text-gray-800 hover:bg-gray-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
                choose(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LocationAutocomplete;
