export interface Location {
  lat: number;
  lng: number;
}

export interface Restaurant {
  locationId: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  rating?: number;
  reviews?: number;
  reviewCounts?: { [key: string]: number };
  subratings?: Array<{ name: string; value: number }>;
  priceLevel?: string;
  website?: string;
  phoneNumber?: string;
  address?: string;
  photos: number;
  businessStatus: string;
  distanceInfo?: {
    distance: string;
  };
  description?: string;
  features?: string[];
  cuisine?: string[];
  hours?: string[];
  ranking?: string;
  // Legacy fields for Geoapify compatibility
  place_id?: string;
  lat?: number;
  lon?: number;
  address_line1?: string;
  address_line2?: string;
  categories?: string[];
  user_ratings_total?: number;
}

export interface GeocodeResponse {
  results: Array<{
    lat: number;
    lon: number;
    formatted: string;
  }>;
}

export interface RoutingResponse {
  features: Array<{
    type: string;
    geometry: {
      type: string;
      coordinates: Array<[number, number]>;
    };
  }>;
}

export interface PlacesResponse {
  features: Array<{
    properties: {
      place_id: string;
      name: string;
      lat: number;
      lon: number;
      rating?: number;
      user_ratings?: number;
      address_line1?: string;
      address_line2?: string;
      categories?: string[];
      website?: string;
      datasource?: {
        raw?: {
          price_level?: number;
          opening_hours?: string[];
          phone?: string;
        };
      };
    };
  }>;
}

export class GeoapifyError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'GeoapifyError';
  }
}

export type SearchMode = 'route' | 'meetup';

export interface SearchParams {
  origin: string;
  destination: string;
  placeType: string;
  distanceOffRoute?: number;
  skipFromStart?: number;
  maxLocations?: number;
  radius?: number;
}

export interface SearchResult {
  places: Restaurant[];
  route?: { coordinates: [number, number][] };
  center: Location;
  mode?: SearchMode;
  originLocation?: [number, number];
  destinationLocation?: [number, number];
}

export const PLACE_CATEGORIES = [
  { id: "catering.restaurant", label: "Restaurants", icon: "utensils" },
  { id: "commercial.shopping_mall", label: "Shopping", icon: "shopping-bag" },
  { id: "leisure.park", label: "Parks", icon: "mountain" },
  { id: "tourism.attraction", label: "Attractions", icon: "map-pin" },
  { id: "tourism.museum", label: "Museums", icon: "building" },
  { id: "catering.cafe", label: "Cafes", icon: "coffee" }
];