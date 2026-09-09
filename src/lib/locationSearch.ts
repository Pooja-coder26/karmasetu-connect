import { INDIA_ADMINISTRATIVE_PLACES } from './indiaLocationsData';

export interface PlaceSuggestion {
  name: string;
  secondary: string;
  description: string;
  lat: number;
  lng: number;
  type?: string;
}

// In-memory cache for fast repeated queries
const searchCache = new Map<string, PlaceSuggestion[]>();

/**
 * Instant local search against the 550+ Indian administrative places dataset
 */
export function searchLocalIndiaPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const exactMatches: PlaceSuggestion[] = [];
  const namePrefixMatches: PlaceSuggestion[] = [];
  const wordPrefixMatches: PlaceSuggestion[] = [];
  const secondaryPrefixMatches: PlaceSuggestion[] = [];
  const containsMatches: PlaceSuggestion[] = [];

  for (const p of INDIA_ADMINISTRATIVE_PLACES) {
    const nameLower = p.name.toLowerCase();
    const secLower = p.secondary.toLowerCase();
    const descLower = p.description.toLowerCase();

    if (nameLower === clean) {
      exactMatches.push({
        name: p.name,
        secondary: p.secondary,
        description: p.description,
        lat: p.lat,
        lng: p.lng,
        type: p.type,
      });
    } else if (nameLower.startsWith(clean)) {
      namePrefixMatches.push({
        name: p.name,
        secondary: p.secondary,
        description: p.description,
        lat: p.lat,
        lng: p.lng,
        type: p.type,
      });
    } else {
      // Check if any individual word starts with query (e.g. "Kannada" in "Uttara Kannada")
      const words = nameLower.split(/[\s,/-]+/);
      if (words.some((w) => w.startsWith(clean))) {
        wordPrefixMatches.push({
          name: p.name,
          secondary: p.secondary,
          description: p.description,
          lat: p.lat,
          lng: p.lng,
          type: p.type,
        });
      } else if (secLower.startsWith(clean) || descLower.startsWith(clean)) {
        secondaryPrefixMatches.push({
          name: p.name,
          secondary: p.secondary,
          description: p.description,
          lat: p.lat,
          lng: p.lng,
          type: p.type,
        });
      } else if (
        nameLower.includes(clean) ||
        secLower.includes(clean) ||
        descLower.includes(clean)
      ) {
        containsMatches.push({
          name: p.name,
          secondary: p.secondary,
          description: p.description,
          lat: p.lat,
          lng: p.lng,
          type: p.type,
        });
      }
    }
  }

  const combined = [
    ...exactMatches,
    ...namePrefixMatches,
    ...wordPrefixMatches,
    ...secondaryPrefixMatches,
    ...containsMatches,
  ];

  return deduplicateSuggestions(combined).slice(0, limit);
}

/**
 * Format secondary address information from Nominatim address breakdown
 */
function formatNominatimSecondary(item: any): { name: string; secondary: string; description: string } {
  const addr = item.address || {};
  const name =
    item.name ||
    addr.village ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.residential ||
    addr.town ||
    addr.city ||
    item.display_name.split(',')[0].trim();

  const secParts: string[] = [];

  const subDistrict = addr.subdistrict || addr.county || addr.taluk || addr.tehsil;
  const district = addr.state_district || addr.district;
  const cityOrTown = addr.city || addr.town;
  const state = addr.state;

  if (cityOrTown && cityOrTown.toLowerCase() !== name.toLowerCase()) {
    secParts.push(cityOrTown);
  } else if (subDistrict && subDistrict.toLowerCase() !== name.toLowerCase()) {
    secParts.push(subDistrict);
  }

  if (district && !secParts.includes(district) && district.toLowerCase() !== name.toLowerCase()) {
    secParts.push(district);
  }

  if (state && !secParts.includes(state)) {
    secParts.push(state);
  }

  secParts.push('India');

  const secondary = secParts.join(', ');
  const description = `${name}, ${secondary}`;

  return { name, secondary, description };
}

/**
 * Fetch dynamic suggestions from OpenStreetMap Nominatim for India
 */
async function fetchNominatimSuggestions(query: string): Promise<PlaceSuggestion[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&addressdetails=1&limit=6&q=${encodeURIComponent(
      query.trim()
    )}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const results: PlaceSuggestion[] = [];

    for (const item of data) {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const { name, secondary, description } = formatNominatimSecondary(item);

      results.push({
        name,
        secondary,
        description,
        lat,
        lng,
        type: item.type || 'place',
      });
    }

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Deduplicate suggestions by normalized name and proximity
 */
function deduplicateSuggestions(items: PlaceSuggestion[]): PlaceSuggestion[] {
  const result: PlaceSuggestion[] = [];

  for (const item of items) {
    const normName = item.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isDuplicate = result.some((existing) => {
      const existingNorm = existing.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const latDiff = Math.abs(existing.lat - item.lat);
      const lngDiff = Math.abs(existing.lng - item.lng);

      // Same name and close coordinates, or exact same description
      if (
        (normName === existingNorm && latDiff < 0.08 && lngDiff < 0.08) ||
        existing.description.toLowerCase() === item.description.toLowerCase()
      ) {
        return true;
      }
      return false;
    });

    if (!isDuplicate) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Hybrid search for Indian locations:
 * - Instant local administrative dataset results (<1ms)
 * - Combined with live Nominatim geocoder results for deep villages/streets (when query >= 3 chars)
 */
export async function searchIndiaLocations(
  query: string,
  limit = 8
): Promise<PlaceSuggestion[]> {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  // Check memory cache
  const cached = searchCache.get(clean);
  if (cached) {
    return cached;
  }

  // 1. Get instant local dataset results
  const localResults = searchLocalIndiaPlaces(query, limit);

  // If query is short (< 3 chars), return local results immediately
  if (clean.length < 3) {
    searchCache.set(clean, localResults);
    return localResults;
  }

  try {
    // 2. Query Nominatim for all-India live places, villages, and localities
    const liveResults = await fetchNominatimSuggestions(query);

    // Merge: local exact/prefix matches first, then live results, then local contains
    const merged = deduplicateSuggestions([...localResults, ...liveResults]).slice(0, limit);

    searchCache.set(clean, merged);
    return merged;
  } catch (err) {
    return localResults;
  }
}
