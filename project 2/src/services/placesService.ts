import type { Restaurant } from '../types';

const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes
const placeCache = new Map<string, { data: any, timestamp: number }>();

function getCachedData<T>(key: string): T | null {
  const cached = placeCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data as T;
  }
  return null;
}

function setCachedData<T>(key: string, data: T): void {
  placeCache.set(key, { data, timestamp: Date.now() });
}

export async function getPlaceDetails(locationId: string): Promise<Partial<Restaurant>> {
  // Check cache first
  const cacheKey = `place_${locationId}`;
  const cached = getCachedData<Partial<Restaurant>>(cacheKey);
  if (cached) return cached;

  try {
    console.log(`Fetching details for location ID: ${locationId}`);

    const response = await fetch(`/.netlify/functions/tripadvisor?locationId=${locationId}`);
    if (!response.ok) {
      throw new Error(`Failed to get place details: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Place details raw response for ${locationId}:`, result);

    // Check if we have valid data in the response
    if (result && result.data) {
      const placeData: Partial<Restaurant> = {
        locationId: result.data.location_id || locationId,
        name: result.data.name,
        location: {
          lat: parseFloat(result.data.latitude),
          lng: parseFloat(result.data.longitude)
        },
        rating: result.data.rating,
        reviews: result.data.num_reviews,
        priceLevel: result.data.price_level,
        website: result.data.web_url,
        phoneNumber: result.data.phone,
        address: result.data.address_obj?.address_string,
        photos: result.data.photos || [],
        businessStatus: result.data.business_status || 'OPERATIONAL'
      };

      console.log(`Successfully processed details for: ${locationId}`, placeData);
      setCachedData(cacheKey, placeData);
      return placeData;
    } else {
      console.log(`No valid data structure found for: ${locationId}`, result);
      throw new Error('Invalid data structure received from TripAdvisor API');
    }
  } catch (error) {
    console.error('Error in getPlaceDetails:', error);
    throw error;
  }
}

async function searchSingleLocation(
  location: { lat: number, lng: number },
  placeType: string,
  radius: number,
  seenLocationIds: Set<string>
): Promise<Restaurant[]> {
  const cacheKey = `search_${location.lat}_${location.lng}_${placeType}_${radius}`;
  const cached = getCachedData<Restaurant[]>(cacheKey);
  if (cached) {
    const uniqueResults = cached.filter(place =>
      place.locationId &&
      !seenLocationIds.has(place.locationId) &&
      place.businessStatus !== 'CLOSED'
    );
    uniqueResults.forEach(place => {
      if (place.locationId) seenLocationIds.add(place.locationId);
    });
    return uniqueResults;
  }

  try {
    // First, search for places using the name and location
    const searchResponse = await fetch(
      `/.netlify/functions/tripadvisor/search?lat=${location.lat}&lng=${location.lng}&type=${placeType}&radius=${radius}`
    );

    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    console.log('TripAdvisor search raw response:', searchData);

    // Check if we have a valid response with data
    if (!searchData || !searchData.data) {
      console.log('No data in search response');
      return [];
    }

    // Extract the location data from the search results
    const results: Restaurant[] = searchData.data.map((item: any) => ({
      locationId: item.location_id,
      name: item.name,
      location: {
        lat: parseFloat(item.latitude),
        lng: parseFloat(item.longitude)
      },
      rating: item.rating,
      reviews: item.num_reviews,
      priceLevel: item.price_level,
      website: item.web_url,
      phoneNumber: item.phone,
      address: item.address_obj?.address_string,
      photos: item.photos || [],
      businessStatus: item.business_status || 'OPERATIONAL'
    }));

    // Filter out invalid results and duplicates
    const validResults = results.filter(result =>
      result.locationId &&
      result.name &&
      !seenLocationIds.has(result.locationId) &&
      result.businessStatus !== 'CLOSED'
    );

    // Add valid location IDs to seen set
    validResults.forEach(result => {
      seenLocationIds.add(result.locationId);
    });

    // Cache the results
    if (validResults.length > 0) {
      console.log(`Found ${validResults.length} valid results for location ${location.lat},${location.lng}`);
      setCachedData(cacheKey, validResults);
    } else {
      console.log(`No valid results found for location ${location.lat},${location.lng}`);
    }

    return validResults;
  } catch (error) {
    console.error('Error searching locations:', error);
    return [];
  }
}

export async function searchNearbyPlaces(
  center: { lat: number, lng: number },
  placeType: string,
  radius: number,
  maxResults: number
): Promise<Restaurant[]> {
  const seenLocationIds = new Set<string>();
  const allResults: Restaurant[] = [];

  // Initial search at the center point
  const centerResults = await searchSingleLocation(
    center,
    placeType,
    radius,
    seenLocationIds
  );
  allResults.push(...centerResults);

  // If we need more results, search in a grid pattern
  if (allResults.length < maxResults) {
    const gridPoints = [
      { lat: center.lat + 0.01, lng: center.lng },
      { lat: center.lat - 0.01, lng: center.lng },
      { lat: center.lat, lng: center.lng + 0.01 },
      { lat: center.lat, lng: center.lng - 0.01 }
    ];

    await Promise.all(
      gridPoints.map(async point => {
        if (allResults.length < maxResults) {
          const results = await searchSingleLocation(
            point,
            placeType,
            radius / 2,
            seenLocationIds
          );
          allResults.push(...results);
        }
      })
    );
  }

  // Sort by rating and limit to maxResults
  const sortedResults = allResults
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, maxResults);

  // Get details for top results in parallel
  const detailPromises = sortedResults.map(result =>
    result.locationId ? getPlaceDetails(result.locationId) : Promise.resolve(result)
  );

  const details = await Promise.all(detailPromises);
  return details.map((detail, index) => ({
    ...sortedResults[index],
    ...detail
  }));
}

export function calculateDistanceFromOrigin(
  location: { lat: number, lng: number },
  origin: { lat: number, lng: number }
): { distance: string } {
  // Using the Haversine formula to calculate distance
  const R = 6371e3; // Earth's radius in meters
  const φ1 = origin.lat * Math.PI / 180;
  const φ2 = location.lat * Math.PI / 180;
  const Δφ = (location.lat - origin.lat) * Math.PI / 180;
  const Δλ = (location.lng - origin.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  const distanceInMiles = distance * 0.000621371;
  return {
    distance: `${distanceInMiles.toFixed(1)} mi from start`
  };
}

export function calculateMidpoint(
  point1: { lat: number, lng: number },
  point2: { lat: number, lng: number }
): { lat: number, lng: number } {
  const lat1 = point1.lat * Math.PI / 180;
  const lon1 = point1.lng * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const lon2 = point2.lng * Math.PI / 180;

  const Bx = Math.cos(lat2) * Math.cos(lon2 - lon1);
  const By = Math.cos(lat2) * Math.sin(lon2 - lon1);

  const midLat = Math.atan2(
    Math.sin(lat1) + Math.sin(lat2),
    Math.sqrt((Math.cos(lat1) + Bx) * (Math.cos(lat1) + Bx) + By * By)
  );
  const midLon = lon1 + Math.atan2(By, Math.cos(lat1) + Bx);

  return {
    lat: midLat * 180 / Math.PI,
    lng: midLon * 180 / Math.PI
  };
}