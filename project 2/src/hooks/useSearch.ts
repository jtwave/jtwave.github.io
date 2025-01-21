import { useState } from 'react';
import { searchPlaces } from '../services/searchService';
import type { SearchMode, SearchParams, SearchResult } from '../types';

export function useSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (params: SearchParams, mode: SearchMode) => {
    if (!params.origin || !params.destination) {
      setError('Please enter both origin and destination');
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const result = await searchPlaces(params, mode);
      setSearchResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      console.error('Search error:', err);
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