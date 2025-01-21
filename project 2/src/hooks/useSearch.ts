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
    // Force clear previous results
    setSearchResult(null);

    try {
      console.log('Starting search with params:', params);
      const result = await searchPlaces(params, mode);
      console.log('Raw search result:', result);

      if (result.places) {
        // Process each place to ensure all fields are present
        const processedPlaces = result.places.map(place => {
          console.log('Processing place:', place.name, {
            rating: place.rating,
            reviews: place.reviews || place.user_ratings_total,
            priceLevel: place.priceLevel
          });

          // Force convert rating to number if it's a string
          const rating = typeof place.rating === 'string' ? parseFloat(place.rating) : place.rating;

          return {
            ...place,
            rating: rating || 0,
            reviews: place.reviews || place.user_ratings_total || 0,
            priceLevel: place.priceLevel || '$',
            cuisine: Array.isArray(place.cuisine) ? place.cuisine : [],
            photos: typeof place.photos === 'number' ? place.photos : 0,
            // Ensure these fields are always present
            locationId: place.locationId || place.place_id || '',
            address: place.address || place.address_obj?.address_string || '',
            website: place.website || '',
            phoneNumber: place.phoneNumber || place.phone || ''
          };
        });

        console.log('Processed places:', processedPlaces);

        // Force a new object to trigger state update
        setSearchResult({
          ...result,
          places: processedPlaces
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