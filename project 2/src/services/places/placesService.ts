import { geoapifyClient } from '../api/geoapifyClient';
import { TripAdvisorClient } from '../api/tripAdvisorClient';
import type { Location, Restaurant, PlacesResponse } from '../../types';

export class PlacesService {
  private static validateCategory(category: string): string {
    const validCategories = [
      'catering.restaurant',
      'catering.restaurant.pizza',
      'catering.restaurant.italian',
      'catering.restaurant.chinese',
      'catering.restaurant.sushi',
      'commercial.shopping_mall',
      'leisure.park',
      'tourism.attraction',
      'tourism.museum',
      'catering.cafe'
    ];

    if (validCategories.includes(category)) {
      return category;
    }

    return 'catering.restaurant';
  }

  static async searchNearby(
    location: Location,
    category: string,
    radius: number,
    limit: number,
    originLocation: Location
  ): Promise<Restaurant[]> {
    try {
      if (!location || isNaN(location.lat) || isNaN(location.lng)) {
        throw new Error("Invalid location coordinates");
      }

      // Convert radius from miles to meters (1 mile ≈ 1609.34 meters)
      const radiusInMeters = radius * 1609.34;
      const baseRadius = Math.min(radiusInMeters, 5000);
      const validCategory = this.validateCategory(category);
      const searchPoints: Location[] = [location];

      if (radiusInMeters > baseRadius) {
        const gridSize = Math.ceil(radiusInMeters / baseRadius);
        const latStep = 0.05;
        const lngStep = 0.05;

        for (let i = -gridSize; i <= gridSize; i++) {
          for (let j = -gridSize; j <= gridSize; j++) {
            if (i === 0 && j === 0) continue;
            searchPoints.push({
              lat: location.lat + (i * latStep),
              lng: location.lng + (j * lngStep)
            });
          }
        }
      }

      const searchPromises = searchPoints.map(point => {
        const params = {
          categories: validCategory,
          filter: `circle:${point.lng},${point.lat},${baseRadius}`,
          bias: `proximity:${point.lng},${point.lat}`,
          limit: Math.min(limit, 50).toString(),
          lang: 'en',
          conditions: 'named',
          fields: 'formatted,name,place_id,lat,lon,categories,details,datasource,website,address_line1,address_line2'
        };

        return geoapifyClient.get<PlacesResponse>({
          endpoint: 'places',
          params
        }).catch(error => {
          console.error('Places API error:', error);
          return { features: [] };
        });
      });

      const responses = await Promise.all(searchPromises);
      const seenPlaceIds = new Set<string>();
      const places: Restaurant[] = [];

      // Process places
      for (const response of responses) {
        if (response?.features) {
          for (const feature of response.features) {
            const props = feature.properties;
            if (props && props.name && props.lat && props.lon && !seenPlaceIds.has(props.place_id)) {
              seenPlaceIds.add(props.place_id);

              // Create restaurant object without rating (will be added by TripAdvisor)
              const restaurant: Restaurant = {
                place_id: props.place_id,
                name: props.name,
                lat: props.lat,
                lon: props.lon,
                address_line1: props.address_line1,
                address_line2: props.address_line2,
                categories: props.categories,
                website: props.website,
                distanceInfo: {
                  distance: this.calculateDistanceFromOrigin(
                    { lat: props.lat, lng: props.lon },
                    originLocation
                  )
                }
              };

              places.push(restaurant);
            }
          }
        }
      }

      // Enrich with TripAdvisor data
      const enrichedPlaces = await Promise.all(
        places.map(async place => {
          try {
            const enrichedPlace = await TripAdvisorClient.enrichRestaurantData(place);
            console.log('Enriched place data:', {
              name: enrichedPlace.name,
              rating: enrichedPlace.rating,
              reviews: enrichedPlace.reviews,
              priceLevel: enrichedPlace.priceLevel
            });
            return enrichedPlace;
          } catch (error) {
            console.error('Failed to enrich place:', place.name, error);
            return place;
          }
        })
      );

      // Sort by TripAdvisor rating and distance
      const sortedPlaces = enrichedPlaces
        .filter(place => place !== null)
        .sort((a, b) => {
          // Convert ratings to numbers, default to 0 if not present
          const ratingA = typeof a.rating === 'string' ? parseFloat(a.rating) : (a.rating || 0);
          const ratingB = typeof b.rating === 'string' ? parseFloat(b.rating) : (b.rating || 0);

          // Get distances, default to 0 if not present
          const distanceA = parseFloat(a.distanceInfo?.distance || '0');
          const distanceB = parseFloat(b.distanceInfo?.distance || '0');

          // Weight rating more heavily but consider distance
          return (ratingB - ratingA) * 2 + (distanceA - distanceB);
        })
        .slice(0, limit);

      console.log('Final sorted places:', sortedPlaces.map(place => ({
        name: place.name,
        rating: place.rating,
        reviews: place.reviews,
        priceLevel: place.priceLevel
      })));

      return sortedPlaces;

    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  static calculateDistanceFromOrigin(point: Location, origin: Location): string {
    const R = 6371; // Earth's radius in km
    const dLat = (point.lat - origin.lat) * Math.PI / 180;
    const dLon = (point.lng - origin.lng) * Math.PI / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(origin.lat * Math.PI / 180) * Math.cos(point.lat * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c * 0.621371; // Convert to miles

    return `${distance.toFixed(1)} mi from start`;
  }
}