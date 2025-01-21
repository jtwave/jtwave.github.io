import React from 'react';
import { Star, ExternalLink, Navigation } from 'lucide-react';
import type { Restaurant } from '../types';

interface RestaurantCardProps {
  restaurant: Restaurant;
  className?: string;
}

export function RestaurantCard({ restaurant, className = '' }: RestaurantCardProps) {
  const handleClick = () => {
    if (restaurant.website) {
      window.open(restaurant.website, '_blank');
    }
  };

  // Helper function to format rating
  const formatRating = (rating: string | number | undefined): string => {
    if (typeof rating === 'string') {
      return rating;
    }
    if (typeof rating === 'number') {
      return rating.toFixed(1);
    }
    return '';
  };

  // Get the review count from either field
  const reviewCount = restaurant.user_ratings_total || restaurant.reviews;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm overflow-hidden cursor-pointer transform transition-all duration-300 hover:shadow-lg hover:scale-[1.02] group relative ${className}`}
      onClick={handleClick}
    >
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2 text-gray-900 group-hover:text-blue-600 transition-colors duration-300">
          {restaurant.name}
        </h3>

        <div className="flex items-center mb-2 text-sm">
          {restaurant.rating ? (
            <div className="flex items-center text-yellow-500">
              <Star className="h-4 w-4 fill-current" />
              <span className="ml-1 font-medium">{formatRating(restaurant.rating)}</span>
              {reviewCount && (
                <span className="text-gray-500 text-sm ml-1">
                  ({reviewCount})
                </span>
              )}
            </div>
          ) : (
            <span className="text-gray-500 text-sm">No ratings yet</span>
          )}
        </div>

        <p className="text-gray-600 text-sm">
          {restaurant.address || (
            <>
              {restaurant.address_line1}
              {restaurant.address_line2 && <>, {restaurant.address_line2}</>}
            </>
          )}
        </p>

        {restaurant.website && (
          <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-md group-hover:scale-110 transition-transform duration-300">
            <ExternalLink className="h-4 w-4 text-blue-600" />
          </div>
        )}

        {restaurant.distanceInfo && (
          <div className="mt-2">
            <div className="inline-flex items-center space-x-1 bg-blue-50 rounded-full px-3 py-1">
              <Navigation className="h-3 w-3 text-blue-600" />
              <span className="text-xs font-medium text-gray-700">
                {restaurant.distanceInfo.distance}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}