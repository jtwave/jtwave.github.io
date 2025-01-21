import type { Restaurant } from '../../types';

const PROXY_URL = '/.netlify/functions/tripadvisor-proxy';

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
      console.log('Starting TripAdvisor enrichment for:', name);
      const response = await fetch(PROXY_URL, {
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error('TripAdvisor API error:', errorText);
        throw new Error(`TripAdvisor API error: ${response.status}`);
      }

      const { data } = await response.json();

      if (!data) {
        console.log('No TripAdvisor results found for:', name);
        return null;
      }

      // Extract data from the enriched response
      const locationData = {
        ...data,
        rating: data.details?.rating || data.rating,
        num_reviews: data.details?.num_reviews || data.num_reviews,
        website: data.details?.website || data.web_url,
        phone: data.details?.phone || data.phone,
        address_obj: data.details?.address_obj || data.address_obj,
        photos: data.details?.photos || data.photos
      };

      return locationData;
    } catch (error) {
      console.error(`TripAdvisor search failed for ${name}:`, error);
      return null;
    }
  }

  static async enrichRestaurantData(restaurant: Restaurant): Promise<Restaurant> {
    try {
      const tripAdvisorData = await this.searchLocation(restaurant.name, restaurant.lat, restaurant.lon);

      if (!tripAdvisorData) {
        return restaurant;
      }

      // Create enriched restaurant data
      const enrichedRestaurant: Restaurant = {
        ...restaurant,
        locationId: tripAdvisorData.location_id,
        rating: parseFloat(tripAdvisorData.rating?.toString() || '0'),
        reviews: tripAdvisorData.num_reviews,
        website: tripAdvisorData.website,
        phoneNumber: tripAdvisorData.phone,
        address: tripAdvisorData.address_obj?.address_string,
        photos: tripAdvisorData.photos || [],
        businessStatus: 'OPERATIONAL',
        location: {
          lat: parseFloat(tripAdvisorData.latitude || restaurant.lat.toString()),
          lng: parseFloat(tripAdvisorData.longitude || restaurant.lon.toString())
        }
      };

      return enrichedRestaurant;
    } catch (error) {
      console.error('Failed to enrich restaurant data:', restaurant.name, error);
      return restaurant;
    }
  }
}