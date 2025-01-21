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
  };
  website: string;
  details?: {
    rating: number;
    num_reviews: number;
    website: string;
  };
}

export class TripAdvisorClient {
  static async searchLocation(name: string, lat: number, lon: number): Promise<TripAdvisorLocation | null> {
    try {
      console.log('Searching TripAdvisor for:', name);
      const response = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          latitude: lat,
          longitude: lon
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('TripAdvisor API error:', errorText);
        throw new Error(`TripAdvisor API error: ${response.status}`);
      }

      const { data } = await response.json();
      
      if (!data) {
        console.log('No TripAdvisor data found for:', name);
        return null;
      }

      // Log the entire data object to see what we're getting
      console.log('Raw TripAdvisor data:', data);

      // Make sure we're accessing the correct properties
      const rating = data.details?.rating || data.rating;
      const numReviews = data.details?.num_reviews || data.num_reviews;
      const website = data.details?.website || data.website;

      console.log('Extracted TripAdvisor data:', {
        name: data.name,
        rating,
        numReviews,
        website
      });

      return data;

    } catch (error) {
      console.warn(`TripAdvisor search failed for ${name}:`, error);
      return null;
    }
  }

  static async enrichRestaurantData(restaurant: Restaurant): Promise<Restaurant> {
    try {
      const tripAdvisorData = await this.searchLocation(restaurant.name, restaurant.lat, restaurant.lon);

      if (!tripAdvisorData) {
        console.log('No TripAdvisor data found for:', restaurant.name);
        return restaurant;
      }

      // Use the most detailed rating available
      const rating = tripAdvisorData.details?.rating || tripAdvisorData.rating;
      const numReviews = tripAdvisorData.details?.num_reviews || tripAdvisorData.num_reviews;
      const website = tripAdvisorData.details?.website || tripAdvisorData.website;

      console.log('Enriching restaurant data:', {
        name: restaurant.name,
        rating,
        numReviews,
        website
      });

      // Make sure we're returning a number for rating
      const parsedRating = rating ? parseFloat(rating.toString()) : undefined;

      return {
        ...restaurant,
        rating: parsedRating || restaurant.rating,
        user_ratings_total: numReviews || restaurant.user_ratings_total,
        website: website || restaurant.website
      };

    } catch (error) {
      console.warn('Failed to enrich restaurant data:', restaurant.name, error);
      return restaurant;
    }
  }
}