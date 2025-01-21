import { useState, useEffect } from 'react';
import { searchPlaces } from '../services/searchService';
import type { SearchMode, SearchParams, SearchResult } from '../types';

export function useSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debug state changes
  useEffect(() => {
    console.log('Search Result State:', searchResult);
    if (searchResult?.places) {
      console.log('Places with ratings:', searchResult.places.map(place => ({
        name: place.name,
        rating: place.rating,
        reviews: place.reviews,
        priceLevel: place.priceLevel
      })));
    }
  }, [searchResult]);

  const search = async (params: SearchParams, mode: SearchMode) => {
    if (!params.origin || !params.destination) {
      setError('Please enter both origin and destination');
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      console.log('Starting search with params:', params);
      const result = await searchPlaces(params, mode);
      console.log('Raw search result:', result);

      if (result.places) {
        // Ensure all required fields are present
        const validatedPlaces = result.places.map(place => ({
          ...place,
          rating: place.rating || undefined,
          reviews: place.reviews || place.user_ratings_total,
          priceLevel: place.priceLevel || undefined,
          cuisine: place.cuisine || [],
          photos: typeof place.photos === 'number' ? place.photos : 0
        }));

        setSearchResult({
          ...result,
          places: validatedPlaces
        });
      } else {
        setSearchResult(result);
      }
    } catch (err) {
      console.error('Search error details:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  return {
    search,
    isSearching,
    searchResult,
    error,
    clearResults: () => setSearchResult(null),
  };
}