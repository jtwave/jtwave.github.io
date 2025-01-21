import type { Restaurant } from '../../types';

const PROXY_URL = '/.netlify/functions/tripadvisor-proxy';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

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
  private static async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static async makeRequest(path: string, data: any, retryCount = 0): Promise<any> {
    try {
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      const responseText = await response.text();
      console.log('Raw API Response:', responseText);

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse response:', responseText);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}...`);
      }

      console.log('API Response:', { path, status: response.status, data: responseData });

      if (response.status === 429 && retryCount < MAX_RETRIES) {
        console.log(`Rate limited, retrying in ${RETRY_DELAY}ms...`);
        await this.delay(RETRY_DELAY);
        return this.makeRequest(path, data, retryCount + 1);
      }

      if (!response.ok) {
        throw new Error(responseData.message || `API error: ${response.status}`);
      }

      return responseData;
    } catch (error) {
      console.error('API request failed:', { path, error });
      throw error;
    }
  }

  static async searchLocation(name: string, lat: number, lon: number): Promise<TripAdvisorLocation | null> {
    try {
      console.log('Starting TripAdvisor search for:', name);

      // Make the search request
      const searchData = await this.makeRequest('/location/search', {
        name,
        latitude: lat,
        longitude: lon,
        type: 'restaurant'
      });

      // Extract the locations array
      const locations = searchData.data || [];
      console.log('Search results:', locations);

      if (!Array.isArray(locations) || locations.length === 0) {
        return null;
      }

      // Find the best matching location by name
      const matchingLocation = locations.find((location: TripAdvisorLocation) => {
        const locationName = location.name.toLowerCase();
        const searchName = name.toLowerCase();
        return locationName.includes(searchName) || searchName.includes(locationName);
      });

      if (!matchingLocation) {
        return null;
      }

      console.log('Found matching location:', matchingLocation);

      // Fetch details
      const detailsData = await this.makeRequest(`/location/${matchingLocation.location_id}/details`, {
        name
      });

      // Combine the data
      const result = {
        ...matchingLocation,
        details: detailsData.data
      };

      console.log('Final enriched data:', result);
      return result;
    } catch (error) {
      console.error(`TripAdvisor search failed for ${name}:`, error);
      return null;
    }
  }

  static async enrichRestaurantData(restaurant: Restaurant): Promise<Restaurant> {
    try {
      if (!restaurant.lat || !restaurant.lon) {
        console.error('Missing coordinates for restaurant:', restaurant.name);
        return restaurant;
      }

      const tripAdvisorData = await this.searchLocation(restaurant.name, restaurant.lat, restaurant.lon);

      if (!tripAdvisorData) {
        return restaurant;
      }

      // Get the best rating and review count from either the search or details response
      const rating = tripAdvisorData.details?.rating || tripAdvisorData.rating;
      const reviews = tripAdvisorData.details?.num_reviews || tripAdvisorData.num_reviews;

      // Create enriched restaurant data
      const enrichedRestaurant: Restaurant = {
        ...restaurant,
        locationId: tripAdvisorData.location_id,
        rating: rating ? parseFloat(rating.toString()) : undefined,
        reviews: reviews,
        website: tripAdvisorData.details?.website || tripAdvisorData.website,
        phoneNumber: tripAdvisorData.details?.phone || tripAdvisorData.phone,
        address: tripAdvisorData.details?.address_obj?.address_string || tripAdvisorData.address_obj?.address_string,
        photos: tripAdvisorData.details?.photos || tripAdvisorData.photos || [],
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