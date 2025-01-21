import { Restaurant, TripAdvisorResponse } from '../../types';

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

  private static async makeRequest(method: string, path: string, body?: any): Promise<any> {
    try {
      const response = await fetch(path, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  static async searchLocation(name: string, lat: number, lon: number): Promise<TripAdvisorResponse | null> {
    try {
      const response = await this.makeRequest('POST', PROXY_URL, {
        name,
        lat,
        lon
      });

      if (!response) {
        console.log('No TripAdvisor results found for:', name);
        return null;
      }

      return response as TripAdvisorResponse;
    } catch (error) {
      console.error('TripAdvisor search failed:', error);
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

      // Get the best data from either the details or top-level response
      const details = tripAdvisorData.details || tripAdvisorData;
      const rating = details.rating;
      const reviews = details.num_reviews;
      const priceLevel = details.price_level;
      const website = details.website;
      const phone = details.phone;
      const address = details.address_obj?.address_string;
      const photos = details.photo_count || 0;
      const cuisine = details.cuisine?.map(c => ({ name: c.name })) || [];

      // Create enriched restaurant data
      const enrichedRestaurant: Restaurant = {
        ...restaurant,
        locationId: tripAdvisorData.location_id,
        rating: rating ? parseFloat(rating.toString()) : undefined,
        reviews: reviews ? parseInt(reviews.toString()) : undefined,
        priceLevel: priceLevel || restaurant.priceLevel,
        website: website || restaurant.website,
        phoneNumber: phone || restaurant.phoneNumber,
        address: address || restaurant.address,
        photos: photos,
        cuisine: cuisine,
        businessStatus: 'OPERATIONAL',
        location: {
          lat: parseFloat(tripAdvisorData.latitude || restaurant.lat.toString()),
          lng: parseFloat(tripAdvisorData.longitude || restaurant.lon.toString())
        }
      };

      console.log('Successfully enriched restaurant:', {
        name: enrichedRestaurant.name,
        rating: enrichedRestaurant.rating,
        reviews: enrichedRestaurant.reviews,
        priceLevel: enrichedRestaurant.priceLevel,
        website: enrichedRestaurant.website,
        address: enrichedRestaurant.address,
        cuisine: enrichedRestaurant.cuisine
      });

      return enrichedRestaurant;
    } catch (error) {
      console.error('Failed to enrich restaurant data:', restaurant.name, error);
      return restaurant;
    }
  }
}