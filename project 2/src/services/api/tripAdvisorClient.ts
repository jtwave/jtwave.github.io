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
      console.log('Search parameters:', { name, lat, lon });

      const requestBody = {
        name,
        latitude: lat,
        longitude: lon,
        type: 'restaurant'
      };

      console.log('Making request to:', PROXY_URL);
      console.log('Request body:', requestBody);

      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response status:', response.status);
      const responseText = await response.text();
      console.log('Raw response:', responseText);

      if (!response.ok) {
        console.error('TripAdvisor API error:', responseText);
        throw new Error(`TripAdvisor API error: ${response.status}`);
      }

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse response:', e);
        throw new Error('Invalid JSON response from server');
      }

      console.log('Parsed response:', parsedResponse);

      if (!parsedResponse || !parsedResponse.data) {
        console.log('No TripAdvisor results found for:', name);
        return null;
      }

      // Extract data from the enriched response
      const locationData = {
        ...parsedResponse.data,
        rating: parsedResponse.data.details?.rating || parsedResponse.data.rating,
        num_reviews: parsedResponse.data.details?.num_reviews || parsedResponse.data.num_reviews,
        website: parsedResponse.data.details?.website || parsedResponse.data.web_url,
        phone: parsedResponse.data.details?.phone || parsedResponse.data.phone,
        address_obj: parsedResponse.data.details?.address_obj || parsedResponse.data.address_obj,
        photos: parsedResponse.data.details?.photos || parsedResponse.data.photos
      };

      console.log('Processed location data:', locationData);
      return locationData;
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

      console.log('Successfully enriched restaurant:', enrichedRestaurant);
      return enrichedRestaurant;
    } catch (error) {
      console.error('Failed to enrich restaurant data:', restaurant.name, error);
      return restaurant;
    }
  }
}