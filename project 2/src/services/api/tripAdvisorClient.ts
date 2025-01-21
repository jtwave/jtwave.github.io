import type { Restaurant } from '../../types';

const PROXY_URL = '/api/tripadvisor-proxy';

interface TripAdvisorLocation {
  location_id: string;
  name: string;
  rating: number;
  num_reviews: number;
  address_obj: {
    street1: string;
    street2: string;
    city: string;
    state: string;
    country: string;
    address_string: string;
  };
  website: string;
  phone: string;
  latitude: string;
  longitude: string;
  photos?: any[];
  details?: {
    rating: number;
    num_reviews: number;
    website: string;
    phone: string;
    address_obj: {
      address_string: string;
    };
    photos?: any[];
  };
}

export class TripAdvisorClient {
  static async searchLocation(name: string, lat: number, lon: number): Promise<TripAdvisorLocation | null> {
    try {
      console.log('Starting TripAdvisor search for:', name);

      // First, make the search request
      const searchResponse = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          latitude: lat,
          longitude: lon,
          type: 'restaurant'
        })
      });

      const searchData = await searchResponse.json();
      console.log('Raw search response for', name, ':', JSON.stringify(searchData, null, 2));

      if (!searchResponse.ok) {
        throw new Error(searchData.message || `TripAdvisor API error: ${searchResponse.status}`);
      }

      // Extract the locations array, handling both possible response structures
      let locations;
      if (Array.isArray(searchData.data)) {
        console.log('Found direct data array for', name);
        locations = searchData.data;
      } else if (Array.isArray(searchData.data?.data)) {
        console.log('Found nested data array for', name);
        locations = searchData.data.data;
      } else {
        console.log('Unexpected data structure for', name, ':', typeof searchData.data);
        return null;
      }

      if (!locations || locations.length === 0) {
        console.log('No locations array or empty array for', name);
        return null;
      }

      console.log('Found', locations.length, 'potential matches for', name);

      // Find the best matching location by name
      const matchingLocation = locations.find((location: TripAdvisorLocation) => {
        const locationName = location.name.toLowerCase();
        const searchName = name.toLowerCase();
        const matches = locationName.includes(searchName) || searchName.includes(locationName);
        if (matches) {
          console.log('Found matching location for', name, ':', location.name);
        }
        return matches;
      });

      if (!matchingLocation) {
        console.log('No matching location found for', name);
        return null;
      }

      console.log('Fetching details for', name, 'with ID:', matchingLocation.location_id);

      // Fetch details for the matching location
      const detailsResponse = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fetchDetails: true,
          locationId: matchingLocation.location_id,
          name
        })
      });

      const detailsData = await detailsResponse.json();
      console.log('Details response for', name, ':', JSON.stringify(detailsData, null, 2));

      if (!detailsResponse.ok) {
        throw new Error(detailsData.message || `TripAdvisor API error: ${detailsResponse.status}`);
      }

      // Combine location and details data
      const result = {
        ...matchingLocation,
        details: detailsData.data
      };

      console.log('Final enriched data for', name, ':', JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error(`TripAdvisor search failed for ${name}:`, error);
      return null;
    }
  }

  static async enrichRestaurantData(restaurant: Restaurant): Promise<Restaurant> {
    try {
      console.log('Enriching restaurant data for:', restaurant.name);

      if (!restaurant.lat || !restaurant.lon) {
        console.error('Missing coordinates for restaurant:', restaurant.name);
        return restaurant;
      }

      const tripAdvisorData = await this.searchLocation(restaurant.name, restaurant.lat, restaurant.lon);

      if (!tripAdvisorData) {
        console.log('No TripAdvisor data found for:', restaurant.name);
        return restaurant;
      }

      // Create enriched restaurant data
      const enrichedRestaurant: Restaurant = {
        ...restaurant,
        locationId: tripAdvisorData.location_id,
        rating: parseFloat(tripAdvisorData.rating?.toString() || '0'),
        reviews: tripAdvisorData.num_reviews,
        website: tripAdvisorData.website || tripAdvisorData.details?.website,
        phoneNumber: tripAdvisorData.phone || tripAdvisorData.details?.phone,
        address: tripAdvisorData.address_obj?.address_string || tripAdvisorData.details?.address_obj?.address_string,
        photos: tripAdvisorData.photos || tripAdvisorData.details?.photos || [],
        businessStatus: 'OPERATIONAL',
        location: {
          lat: parseFloat(tripAdvisorData.latitude || restaurant.lat.toString()),
          lng: parseFloat(tripAdvisorData.longitude || restaurant.lon.toString())
        }
      };

      console.log('Successfully enriched restaurant:', enrichedRestaurant);
      return enrichedRestaurant;
    } catch (error) {
      console.error('Failed to enrich restaurant data:', restaurant.name, error);
      return restaurant;
    }
  }
}